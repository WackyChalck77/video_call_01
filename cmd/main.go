package main

// запускать так go run ./cmd -tls
import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

var clients = make(map[*websocket.Conn]bool)
var mu sync.Mutex

func broadcastPeerInfoRequest() {
	req, err := json.Marshal(map[string]string{"type": "request-peer-info"})
	if err != nil {
		return
	}
	for c := range clients {
		_ = c.WriteMessage(websocket.TextMessage, req)
	}
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	ip := clientIP(r)
	hello, _ := json.Marshal(map[string]string{"type": "hello", "ip": ip})
	_ = conn.WriteMessage(websocket.TextMessage, hello)

	mu.Lock()
	clients[conn] = true
	broadcastPeerInfoRequest()
	mu.Unlock()

	defer func() {
		mu.Lock()
		delete(clients, conn)
		mu.Unlock()
		_ = conn.Close()
	}()

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			return
		}
		mu.Lock()
		for c := range clients {
			if c != conn {
				_ = c.WriteMessage(websocket.TextMessage, msg)
			}
		}
		mu.Unlock()
	}
}

func findWebDir(preferred string) string {
	try := func(dir string) (string, bool) {
		if dir == "" {
			return "", false
		}
		info, err := os.Stat(filepath.Join(dir, "index.html"))
		return dir, err == nil && !info.IsDir()
	}
	if dir, ok := try(preferred); ok {
		return dir
	}
	wd, err := os.Getwd()
	if err == nil {
		for _, rel := range []string{"web", filepath.Join("..", "web")} {
			if dir, ok := try(filepath.Join(wd, rel)); ok {
				return dir
			}
		}
	}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		for _, rel := range []string{"web", filepath.Join("..", "web")} {
			if dir, ok := try(filepath.Join(exeDir, rel)); ok {
				return dir
			}
		}
	}
	log.Fatal("не найден web/index.html — запускайте сервер из корня проекта video_call_01")
	return ""
}

func httpsRedirectURL(r *http.Request, httpsAddr string) string {
	_, httpsPort, err := net.SplitHostPort(httpsAddr)
	if err != nil {
		httpsPort = strings.TrimPrefix(httpsAddr, ":")
	}
	host := r.Host
	hostname, _, err := net.SplitHostPort(host)
	if err != nil {
		hostname = host
	}
	path := r.URL.RequestURI()
	if httpsPort == "" || httpsPort == "443" {
		return "https://" + hostname + path
	}
	return fmt.Sprintf("https://%s:%s%s", hostname, httpsPort, path)
}

func ipHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"ip": clientIP(r)})
}

func newMux(webRoot string) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", wsHandler)
	mux.HandleFunc("/api/ip", ipHandler)
	mux.Handle("/", http.FileServer(http.Dir(webRoot)))
	return mux
}

func main() {
	addr := flag.String("addr", ":8080", "HTTP listen address (or HTTPS when -tls is off)")
	httpsAddr := flag.String("https-addr", ":8443", "HTTPS listen address when -tls is set")
	webFlag := flag.String("web", "web", "static files directory")
	useTLS := flag.Bool("tls", false, "serve HTTPS (required for iPhone camera over LAN)")
	certFile := flag.String("cert", "certs/cert.pem", "TLS certificate")
	keyFile := flag.String("key", "certs/key.pem", "TLS private key")
	flag.Parse()

	webRoot := findWebDir(*webFlag)
	log.Printf("статика из %s", webRoot)
	mux := newMux(webRoot)

	if *useTLS {
		if _, err := os.Stat(*certFile); err != nil {
			fmt.Println("Сертификат не найден. Создайте его (из корня проекта):")
			fmt.Println(`  mkdir certs`)
			fmt.Println(`  openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=video-call"`)
			log.Fatal(err)
		}

		redirect := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			target := httpsRedirectURL(r, *httpsAddr)
			http.Redirect(w, r, target, http.StatusTemporaryRedirect)
		})

		go func() {
			log.Printf("HTTP  %s → редирект на HTTPS (%s)", *addr, *httpsAddr)
			if err := http.ListenAndServe(*addr, redirect); err != nil {
				log.Fatal(err)
			}
		}()

		fmt.Println()
		fmt.Println("Откройте в браузере (именно https, не http):")
		fmt.Printf("  https://localhost%s/\n", *httpsAddr)
		fmt.Printf("  https://<IP-вашего-ПК>%s/\n", *httpsAddr)
		fmt.Println()
		fmt.Printf("Если набрали http://…%s — сработает редирект на HTTPS.\n", *addr)
		fmt.Println("Не открывайте http:// на порту HTTPS (8443) — будет ошибка в логах.")
		fmt.Println("На iPhone примите предупреждение о самоподписанном сертификате.")
		fmt.Println()

		log.Printf("HTTPS %s", *httpsAddr)
		log.Fatal(http.ListenAndServeTLS(*httpsAddr, *certFile, *keyFile, mux))
	}

	fmt.Printf("HTTP http://localhost%s/\n", *addr)
	fmt.Println("Для iPhone: go run ./cmd -tls")
	log.Fatal(http.ListenAndServe(*addr, mux))
}
