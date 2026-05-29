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
	httpsAddr := flag.String("https-addr", ":8443", "HTTPS listen address")
	webFlag := flag.String("web", "web", "static files directory")
	certFile := flag.String("cert", "certs/cert.pem", "TLS certificate")
	keyFile := flag.String("key", "certs/key.pem", "TLS private key")
	flag.Parse()

	webRoot := findWebDir(*webFlag)
	log.Printf("статика из приложения %s", webRoot)
	mux := newMux(webRoot)

	if _, err := os.Stat(*certFile); err != nil {
		fmt.Println("Сертификат не найден. Создайте его:")
		fmt.Println(`  mkdir certs`)
		fmt.Println(`  openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=video-call"`)
		log.Fatal(err)
	}

	fmt.Println()
	fmt.Println("Откройте в браузере (именно https, не http):")
	fmt.Printf("  https://localhost%s/\n", *httpsAddr)
	fmt.Printf("  https://<IP-вашего-ПК>%s/\n", *httpsAddr)
	fmt.Println()
	fmt.Println("Примите предупреждение о самоподписанном сертификате.")
	fmt.Println()

	log.Printf("HTTPS %s", *httpsAddr)
	log.Fatal(http.ListenAndServeTLS(*httpsAddr, *certFile, *keyFile, mux))
}
