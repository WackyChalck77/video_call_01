function app() {
    return {
        // --- Исходные данные ---
        tle1: '1  1291U 65016D   25078.56375797  .00000104  00000-0  11637-3 0  9998',
        tle2: '2  1291  70.0776 122.7506 0021247 350.2630   9.8060 13.94893552 53796',
        gatewayLat: 55.917,
        gatewayLon: 37.861,
        minElevation: 30.0,

        tle1Cup: '1  1291U 65016D   25078.56375797  .00000104  00000-0  11637-3 0  9998',
        tle2Cup: '2  1291  70.0776 122.7506 0021247 350.2630   9.8060 13.94893552 53796',
        cupLat: 59 + 56 / 60 + 19 / 3600,
        cupLon: 30 + 18 / 60 + 51 / 3600,
        minElevationCup: 30.0,

        links: [],
        passes: [],
        savedPasses: [],
        selectedPass: { id: null },
        passesCup: [],
        savedPassesCup: [],
        selectedPassCup: { id: null },
        uploadDragOver: false,
        uploadInProgress: false,
        uploadDragOverCup: false,
        uploadInProgressCup: false,
        calendar: null,
        subsystems: [],
        timelineStart: '00:00',
        timelineEnd: '24:00',
        selectedDay: null,
        selectedEvent: null,
        editingReclamation: false,
        reclamationText: '',
        activeView: 'plan',
        navItems: [
            { id: 'plan', label: 'План подсистем', icon: '🗓️' },
            { id: 'gateway', label: 'Сеансы Шлюз-КА', icon: '📡' },
            { id: 'cup', label: 'Сеансы ЦУП-КА', icon: '📡' },
            { id: 'calendar', label: 'Календарь', icon: '📅' },
        ],
        // Возможные подсистемы (потом перенести в бэкенд)
        availableSubsystems: [
            { value: 'subsys-001', label: 'ЦУС' },
            { value: 'subsys-002', label: 'Шлюз' },
            { value: 'subsys-003', label: 'ЦУП' }
        ],
        // пустое событие чтобы было по умолчанию
        newEvent: {
            subsystem_id: 'subsys-001',
            start: '',
            end: '',
            label: '',
            type: 'pass'
        },

        // ==========================
        //  ИНИЦИАЛИЗАЦИЯ ПРИ СТАРТЕ
        // ==========================

     
        async init() {
            const self = this;

            // 1. Создаём календарь
            this.$nextTick(() => {
                const calendarEl = document.getElementById('calendar');
                if (!calendarEl || self.calendar) return;

                self.calendar = new FullCalendar.Calendar(calendarEl, {
                    locale: 'ru',
                    buttonText: {
                        today: 'Сегодня',
                        month: 'Месяц',
                        week: 'Неделя',
                        day: 'День'
                    },
                    initialView: 'dayGridMonth',
                    initialDate: new Date(),
                    headerToolbar: {
                        left: 'prev,next today',
                        center: 'title',
                        right: 'dayGridMonth,timeGridWeek,timeGridDay'
                    },

                    dateClick(info) {
                        console.log('🖱️ КЛИК ПО ДНЮ!', info.dateStr);
                        console.log('Выбран день', info.dateStr);
                        self.calendar.changeView('timeGridDay');
                        self.calendar.gotoDate(info.date);

                         // Синхронизируем базовый день для диаграммы
                        self.selectedDay = self.normalizeSchedulerDay(new Date(info.dateStr));

                    },
                    datesSet(arg) {
                        // для отработки при изменении даты next/prev 
                        // в виджете календаря
                        self.selectedDay = self.normalizeSchedulerDay(self.calendar.getDate());
                    },


                    height: 600,
                    aspectRatio: 1.8,
                    nowIndicator: true,
                    dayMaxEvents: 3,
                    timeZone: 'Europe/Moscow',
                    events: [],

                    eventClick(info) {
                        self.selectedPass.id = info.event.id;
                        info.el.style.border = '3px solid red';
                        info.el.style.borderRadius = '4px';
                        alert('Выбран сеанс: ' + info.event.title);
                    }
                });

                self.calendar.render();
            });

            

            // 2. Загружаем сохранённые сеансы
            await this.loadSavedPasses();
            await this.loadSavedPassesCup();
// ========================== Для DataPicker ==========================
 // 3. Инициализация flatpickr для поля даты события подсистемы
this.$nextTick(() => {
  // START
  if (this.$refs.startDateTime) {
    const fpStart = flatpickr(this.$refs.startDateTime, {
      locale: flatpickr.l10ns.ru,
      enableTime: true,
      time_24hr: true,
      dateFormat: "Z",
      minuteIncrement: 1,
    });

  }

  // END
  if (this.$refs.endDateTime) {
    const fpEnd = flatpickr(this.$refs.endDateTime, {
      locale: flatpickr.l10ns.ru,
      enableTime: true,
      time_24hr: true,
      dateFormat: "Z",
      minuteIncrement: 1,
    });


  }
});

// если это убрать - то план подсистем будет появляться по кнопке
            await this.loadScheduler();
            this.ensureSchedulerDay();
            console.log('✅ Инициализация завершена');
            console.log('Подсистем:', this.subsystems.length);


            await this.loadLinks();
    this.startAutoCheck(); // автообновление состояний подсистем в плане доступности сети

        },

        // ==========================
        //  ДОСТУПНОСТЬ УСТРОЙСТВ СЕТИ
        // ==========================

async loadLinks() {
    try {
        const resp = await fetch('/api/links');
        if (resp.ok) {
            this.links = await resp.json();
        }
    } catch (err) {
        this.links = [];
    }
},

async checkLink(deviceId) {
    try {
        const resp = await fetch(`/api/link/${deviceId}/check`, {
            method: 'POST',
        });
        if (resp.ok) {
            const link = await resp.json();
            const index = this.links.findIndex(l => l.device_id === deviceId);
            if (index !== -1) {
                this.links[index] = link;
            }
        }
    } catch (err) {
        console.error('Ошибка проверки:', err);
    }
},

startAutoCheck() {
    setInterval(async () => {
        for (const link of this.links) {
            await this.checkLink(link.device_id);
        }
    }, 10000); // каждые 10 секунд
},


        // ==========================
        //  ЗАПРОС СЕАНСОВ
        // ==========================
        async fetchPasses() {
            if (!this.tle1.trim() || !this.tle2.trim()) {
                alert('Введите TLE данные (строки 1 и 2)!');
                return;
            }
            if (!this.calendar) {
                console.warn('⏳ Календарь ещё инициализируется...');
                return;
            }

            try {
                const payload = {
                    tle1: this.tle1.trim(),
                    tle2: this.tle2.trim(),
                    lat: this.gatewayLat,
                    lon: this.gatewayLon,
                    alt: 150,
                    days: 3,
                    minElevation: Number(this.minElevation) || 30.0
                };
                console.log('📡 Отправляю запрос:', payload);

                const resp = await fetch('/api/passes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!resp.ok) {
                    const errorText = await resp.text();
                    throw new Error('Ошибка сервера: ' + resp.status + ' ' + errorText);
                }

                this.passes = await resp.json();
                this.selectedPass.id = null;

                if (this.calendar && this.passes.length > 0) {
                    this.calendar.gotoDate(new Date());
                }

                // Удаляем старые "рассчитанные" события (по id)
                const calculatedEventIds = this.passes.map(p => p.id);

                this.calendar.getEvents().forEach(event => {
                    if (calculatedEventIds.includes(event.id)) {
                        event.remove();
                    }
                });

                console.log('✅ Рассчитано ' + this.passes.length + ' сеансов');
            } catch (err) {
                console.error('Ошибка загрузки сеансов:', err);
                alert('Не удалось загрузить сеансы: ' + err.message);
            }



        },

        async fetchPassesCup() {
            if (!this.tle1Cup.trim() || !this.tle2Cup.trim()) {
                alert('Введите TLE данные (строки 1 и 2) для ЦУП!');
                return;
            }
            if (!this.calendar) {
                console.warn('⏳ Календарь ещё инициализируется...');
                return;
            }

            try {
                const payload = {
                    tle1: this.tle1Cup.trim(),
                    tle2: this.tle2Cup.trim(),
                    lat: this.cupLat,
                    lon: this.cupLon,
                    alt: 150,
                    days: 3,
                    minElevation: Number(this.minElevationCup) || 30.0
                };
                console.log('📡 Отправляю запрос ЦУП:', payload);

                const resp = await fetch('/api/passes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!resp.ok) {
                    const errorText = await resp.text();
                    throw new Error('Ошибка сервера: ' + resp.status + ' ' + errorText);
                }

                this.passesCup = await resp.json();
                this.selectedPassCup.id = null;

                if (this.calendar && this.passesCup.length > 0) {
                    this.calendar.gotoDate(new Date());
                }

                const calculatedEventIds = this.passesCup.map(p => p.id);
                this.calendar.getEvents().forEach(event => {
                    if (calculatedEventIds.includes(event.id)) {
                        event.remove();
                    }
                });

                console.log('✅ Рассчитано ' + this.passesCup.length + ' сеансов (ЦУП)');
            } catch (err) {
                console.error('Ошибка загрузки сеансов ЦУП:', err);
                alert('Не удалось загрузить сеансы ЦУП: ' + err.message);
            }
        },

        passEndTime(pass) {
            const aos = new Date(pass.AOS).getTime();
            const durNs = Number(pass.Duration);
            return new Date(aos + durNs / 1e6);
        },

        passCalendarTitle(pass, planned = false, location = 'Шлюз') {
            const prefix = planned ? '📌 ' + location + ': ' : location + ': ';
            const base = prefix + pass.MaxElevation.toFixed(1) + '°';
            return pass.file_path ? base + ' 📎' : base;
        },
       
        isPassSaved(passId) {
            if (!Array.isArray(this.savedPasses)) {
                console.warn('savedPasses is not an array:', this.savedPasses);
                return false;
            }
            return this.savedPasses.some(p => p.id === passId);
        },

        getSavedPass(passId) {
            if (!Array.isArray(this.savedPasses)) return undefined;
            return this.savedPasses.find(p => p.id === passId);
        },

        isPassSavedCup(passId) {
            if (!Array.isArray(this.savedPassesCup)) {
                console.warn('savedPassesCup is not an array:', this.savedPassesCup);
                return false;
            }
            return this.savedPassesCup.some(p => p.id === passId);
        },

        getSavedPassCup(passId) {
            if (!Array.isArray(this.savedPassesCup)) return undefined;
            return this.savedPassesCup.find(p => p.id === passId);
        },

        async loadSavedPasses() {
            try {
                const resp = await fetch('/api/saved-passes');
                if (!resp.ok) return;
                const data = await resp.json();
                this.savedPasses = Array.isArray(data) ? data : [];
                await this.$nextTick();
                if (this.calendar) {
                    this.calendar.getEvents().forEach(event => {
                        if (event.extendedProps?.isSaved) event.remove();
                    });
                    this.savedPasses.forEach(p => {
                        this.calendar.addEvent(this.buildSavedPassCalendarEvent(p));
                    });
                    console.log('✅ Загружено ' + this.savedPasses.length + ' запланированных сеансов');
                }
            } catch (err) {
                console.warn('Не удалось загрузить сохранённые сеансы:', err);
            }
        },

        async loadSavedPassesCup() {
            try {
                const resp = await fetch('/api/saved-passes-cup');
                if (!resp.ok) return;
                const data = await resp.json();
                this.savedPassesCup = Array.isArray(data) ? data : [];
                await this.$nextTick();
                if (this.calendar) {
                    this.calendar.getEvents().forEach(event => {
                        if (event.extendedProps?.isSavedCup) event.remove();
                    });
                    this.savedPassesCup.forEach(p => {
                        this.calendar.addEvent(this.buildSavedPassCalendarEvent(p, 'ЦУП'));
                    });
                    console.log('✅ Загружено ' + this.savedPassesCup.length + ' запланированных сеансов (ЦУП)');
                }
            } catch (err) {
                console.warn('Не удалось загрузить сохранённые сеансы ЦУП:', err);
            }
        },

        buildSavedPassCalendarEvent(pass, location = 'Шлюз') {
            const hasFile = !!pass.file_path;
            const isCup = location === 'ЦУП';
            return {
                id: pass.id,
                title: this.passCalendarTitle(pass, true, location),
                start: pass.AOS,
                end: this.passEndTime(pass),
                backgroundColor: hasFile ? (isCup ? '#c026d3' : '#7c3aed') : (isCup ? '#ea580c' : '#1e40af'),
                borderColor: hasFile ? (isCup ? '#86198f' : '#5b21b6') : (isCup ? '#c2410c' : '#1e3a8a'),
                textColor: 'white',
                extendedProps: { isSaved: !isCup, isSavedCup: isCup, hasFile, location }
            };
        },

        async saveSelectedPassCup() {
            if (!this.selectedPassCup.id) {
                alert('Сначала выберите сеанс ЦУП!');
                return;
            }
            const selectedPass = this.passesCup.find(p => p.id === this.selectedPassCup.id);
            if (!selectedPass) return;

            try {
                const resp = await fetch('/api/save-cup-ka-pass', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(selectedPass)
                });

                if (resp.ok) {
                    alert('✅ Сеанс ЦУП успешно сохранён!');
                    const saved = { ...selectedPass, file_path: '' };
                    if (!this.savedPassesCup.some(p => p.id === saved.id)) {
                        this.savedPassesCup.push(saved);
                    }
                    if (this.calendar) {
                        this.calendar.addEvent(this.buildSavedPassCalendarEvent(saved, 'ЦУП'));
                    }
                    await this.loadScheduler();
                } else {
                    const errorText = await resp.text();
                    alert('Ошибка при сохранении: ' + errorText);
                }
            } catch (err) {
                console.error('Ошибка сети при сохранении ЦУП:', err);
                alert('Ошибка сети при сохранении');
            }
        },

        updateCalendarEventForPass(pass, location = 'Шлюз') {
            if (!this.calendar) return;
            const existing = this.calendar.getEventById(pass.id);
            const ev = this.buildSavedPassCalendarEvent(pass, location);
            if (existing) {
                existing.setProp('title', ev.title);
                existing.setProp('backgroundColor', ev.backgroundColor);
                existing.setProp('borderColor', ev.borderColor);
                existing.setExtendedProp('hasFile', ev.extendedProps.hasFile);
            } else {
                this.calendar.addEvent(ev);
            }
        },

        onUploadDragOver(e, isCup = false) {
            e.preventDefault();
            if (isCup) this.uploadDragOverCup = true;
            else this.uploadDragOver = true;
        },

        onUploadDragLeave(isCup = false) {
            if (isCup) this.uploadDragOverCup = false;
            else this.uploadDragOver = false;
        },

        onUploadDrop(e, isCup = false) {
            e.preventDefault();
            if (isCup) this.uploadDragOverCup = false;
            else this.uploadDragOver = false;
            const file = e.dataTransfer?.files?.[0];
            if (file) this.uploadPassFile(file, isCup);
        },

        onUploadFileSelect(e, isCup = false) {
            const file = e.target.files?.[0];
            if (file) this.uploadPassFile(file, isCup);
            e.target.value = '';
        },

        async uploadPassFile(file, isCup = false) {
            const selected = isCup ? this.selectedPassCup : this.selectedPass;
            const savedList = isCup ? this.savedPassesCup : this.savedPasses;
            const location = isCup ? 'ЦУП' : 'Шлюз';

            if (!selected.id) {
                alert('Сначала выберите сеанс!');
                return;
            }
            const passIsSaved = isCup
                ? this.isPassSavedCup(selected.id)
                : this.isPassSaved(selected.id);
            if (!passIsSaved) {
                alert('Сначала запланируйте сеанс (кнопка «Запланировать сеанс»), затем загрузите файл.');
                return;
            }

            const fd = new FormData();
            fd.append('pass_id', selected.id);
            fd.append('file', file);

            if (isCup) this.uploadInProgressCup = true;
            else this.uploadInProgress = true;
            try {
                const resp = await fetch('/api/upload-pass-file', {
                    method: 'POST',
                    body: fd
                });
                if (!resp.ok) {
                    const errText = await resp.text();
                    throw new Error(errText || 'Ошибка загрузки');
                }
                const result = await resp.json();
                const idx = savedList.findIndex(p => p.id === selected.id);
                if (idx >= 0) {
                    savedList[idx].file_path = result.file_path;
                }
                const updated = isCup
                    ? this.getSavedPassCup(selected.id)
                    : this.getSavedPass(selected.id);
                if (updated) this.updateCalendarEventForPass(updated, location);
                await this.loadScheduler();
                alert('✅ Файл «' + (result.file_name || file.name) + '» приложен к сеансу (' + location + ')');
            } catch (err) {
                console.error('Ошибка загрузки файла:', err);
                alert('Не удалось загрузить файл: ' + err.message);
            } finally {
                if (isCup) this.uploadInProgressCup = false;
                else this.uploadInProgress = false;
            }
        },

        // ==========================
        //  СОХРАНЕНИЕ СЕАНСА
        // ==========================
        async saveSelectedPass() {
            if (!this.selectedPass.id) {
                alert('Сначала выберите сеанс!');
                return;
            }
            const selectedPass = this.passes.find(p => p.id === this.selectedPass.id);
            if (!selectedPass) return;

            try {
                const resp = await fetch('/api/save-pass', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(selectedPass)
                });

                if (resp.ok) {
                    alert('✅ Сеанс успешно сохранён!');
                    const saved = { ...selectedPass, file_path: '' };
                    if (!this.savedPasses.some(p => p.id === saved.id)) {
                        this.savedPasses.push(saved);
                    }
                    if (this.calendar) {
                        this.calendar.addEvent(this.buildSavedPassCalendarEvent(saved));
                    }
                    await this.loadScheduler();
                } else {
                    const errorText = await resp.text();
                    alert('Ошибка при сохранении: ' + errorText);
                }
            } catch (err) {
                console.error('Ошибка сети при сохранении:', err);
                alert('Ошибка сети при сохранении');
            }
        },

  
        // ==========================
        //  ЗАПЛАНИРОВАТЬ В КАЛЕНДАРЕ (ЛОКАЛЬНО)
        // ==========================
        submitSelectedPass() {
            if (!this.selectedPass.id) {
                alert('Сначала выберите сеанс в таблице!');
                return;
            }
            if (!this.calendar) {
                alert('❌ Календарь не инициализирован! Обновите страницу.');
                return;
            }

            const selectedPass = this.passes.find(p => p.id === this.selectedPass.id);
            if (!selectedPass) return;

            const existingEvent = this.calendar.getEventById(selectedPass.id);
            if (existingEvent) {
                alert('Этот сеанс уже запланирован!');
                return;
            }

            this.calendar.addEvent({
                id: selectedPass.id,
                title: 'Пролёт: ' + selectedPass.MaxElevation.toFixed(1) + '°',
                start: selectedPass.AOS,
                end: selectedPass.LOS,
                backgroundColor: selectedPass.MaxElevation > 50 ? '#10b981' : '#f59e0b',
                borderColor: selectedPass.MaxElevation > 50 ? '#065f46' : '#b45309',
                extendedProps: { maxElevation: selectedPass.MaxElevation }
            });

            alert(
                '✅ Сеанс ' +
                selectedPass.MaxElevation.toFixed(1) + '° ' +
                new Date(selectedPass.AOS).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit'
                }) +
                ' запланирован в календаре!'
            );
        },



// универсальная функция для получения текущей даты
parseTimeOnDate(timeStr, baseDate) {
    if (!timeStr || !baseDate) return null;
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date(baseDate); // копируем, чтобы не мутировать оригинал
    date.setHours(h, m, 0, 0);
    return date;
},

        setActiveView(view) {
            this.activeView = view;
            if (view === 'calendar') {
                this.$nextTick(() => {
                    if (this.calendar) {
                        this.calendar.updateSize();
                    }
                });
            }
        },

        navItemClass(id) {
            return this.activeView === id
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-700 hover:bg-gray-100';
        },

        normalizeSchedulerDay(d) {
            const day = new Date(d);
            day.setHours(0, 0, 0, 0);
            return day;
        },

        ensureSchedulerDay() {
            if (!this.selectedDay) {
                this.selectedDay = this.normalizeSchedulerDay(new Date());
            } else {
                this.selectedDay = this.normalizeSchedulerDay(this.selectedDay);
            }
        },

        shiftSchedulerDay(delta) {
            this.ensureSchedulerDay();
            const d = new Date(this.selectedDay);
            d.setDate(d.getDate() + delta);
            this.selectedDay = d;
            if (this.calendar) {
                this.calendar.gotoDate(d);
            }
        },

        goToSchedulerToday() {
            this.selectedDay = this.normalizeSchedulerDay(new Date());
            if (this.calendar) {
                this.calendar.gotoDate(this.selectedDay);
            }
        },

        schedulerDayLabel() {
            if (!this.selectedDay) return '';
            return this.selectedDay.toLocaleDateString('ru-RU', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        },

        isSchedulerToday() {
            if (!this.selectedDay) return false;
            const today = this.normalizeSchedulerDay(new Date());
            return this.selectedDay.getTime() === today.getTime();
        },

        timelineHourTicks() {
            const ticks = [];
            for (let h = 0; h <= 24; h++) {
                ticks.push({
                    hour: h,
                    leftPct: (h / 24) * 100,
                    major: h % 3 === 0
                });
            }
            return ticks;
        },


//         // Вспомогательная: получить Date для сегодняшнего дня + время "HH:MM"
//     parseTimeToToday(timeStr) {
//     const [h, m] = timeStr.split(':').map(Number);
//     const now = new Date();
//     return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
// },

// Преобразовать строку времени события (RFC3339) в Date
parseEventTime(t) {
    return new Date(t); // уже RFC3339, этого достаточно
},

 // ==========================
 //  НОВЫЕ МЕТОДЫ: вычисление длительности
 // ==========================
getEventWidthPercent(ev) {
  if (!ev || !ev.start || !ev.end || !this.selectedDay) return 0;

  // базовый день: 00:00 - 24:00
  const dayStart = new Date(this.selectedDay);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(this.selectedDay);
  dayEnd.setHours(24, 0, 0, 0);
  const totalMs = dayEnd - dayStart;

  // времена события
  const s = new Date(ev.start);
  const e = new Date(ev.end);

  // усечение к диапазону дня
  const sClamped = Math.max(dayStart, s);
  const eClamped = Math.min(dayEnd, e);

  const offsetMs = sClamped - dayStart;
  const durationMs = Math.max(0, eClamped - sClamped);

  const widthPct = (durationMs / totalMs) * 100;
// console.log('Функция успешно отработала, ширина:', widthPct);

  // ограничим в 0..100, минимум 0
  return Math.max(0, Math.min(100, widthPct));         
},

// приведение даты в формат времени для отображения в Ганте по текущему дню
formatTimeNoMS(dateStr) {
  // dateStr — ISO 8601, например "2026-05-13T09:00:00.000Z"
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
},





// новый вариант чтобы текущий день отрабатывался
eventBlockStyle(ev) {
    if (!this.selectedDay) {
        return 'display:none;';
    }

    // Используем selectedDay как базу для расчётов
    const dayStart = this.parseTimeOnDate('00:00', this.selectedDay);
    const dayEnd = this.parseTimeOnDate('24:00', this.selectedDay);
    
    if (!dayStart || !dayEnd) return '';
    
    const totalMs = dayEnd - dayStart;
    if (totalMs <= 0) return '';

    const evStart = new Date(ev.start);
    const evEnd = new Date(ev.end);

    const offsetMs = evStart - dayStart;
    const durationMs = evEnd - evStart;

    const left = Math.max(0, (offsetMs / totalMs) * 100);
    const width = Math.max(1, Math.min(100 - left, (durationMs / totalMs) * 100));

    return `left:${left}%;width:${width}%;`;
},



// // Посчитать стиль для блока события (left + width в %)
// eventBlockStyle(ev) {
//  if (!this.selectedDay) {
//         // если день ещё не выбран — можно скрыть диаграмму или просто вернуть пустой стиль
//         return 'display:none;';
//     }

//     // Берём базу: сутки 00:00–24:00
//     const dayStart = this.parseTimeToToday('00:00');
//     const dayEnd = this.parseTimeToToday('24:00');
//     const totalMs = dayEnd - dayStart;
//     if (totalMs <= 0) return '';

//     const evStart = this.parseEventTime(ev.start);
//     const evEnd = this.parseEventTime(ev.end);

//     const offsetMs = evStart - dayStart;
//     const durationMs = evEnd - evStart;

//     const left = Math.max(0, (offsetMs / totalMs) * 100);
//     const width = Math.max(1, (durationMs / totalMs) * 100); // минимум 1%

//     return `left:${left}%;width:${width}%;`;
// },

        // ==========================
        //  ЗАГРУЗКА ПЛАНА ПОДСИСТЕМ
        // ==========================
  // массив подсистем, приходящих с /api/scheduler
        // минимальный метод загрузки
        async loadScheduler() {
            try {
                const resp = await fetch('/api/scheduler');
                if (!resp.ok) {
                    const text = await resp.text();
                    throw new Error(text || 'Ошибка ответа сервера');
                }

                const data = await resp.json();
                // ожидаем формат:
                // { subsystems: [ { id, name, subsystemevents: [...] }, ... ] }

                this.subsystems = data.subsystems || [];
                this.ensureSchedulerDay();

  // добавляем ВСЕ события подсистем в календарь ***
        if (this.calendar) {
            // Очищаем старые события подсистем
            this.calendar.getEvents().forEach(event => {
                if (event.extendedProps?.isSubsystemEvent) {
                    event.remove();
                }
            });

            // Добавляем актуальные
            data.subsystems.forEach(sub => {
                sub.subsystemevents.forEach(ev => {
                    const isSession = ev.type === 'session';
                    const hasFile = !!ev.has_file;
                    let bg = '#ef4444';
                    let border = '#dc2626';
                    if (ev.type === 'pass') {
                        bg = '#10b981';
                        border = '#059669';
                    } else if (isSession) {
                        bg = hasFile ? '#7c3aed' : '#1e40af';
                        border = hasFile ? '#5b21b6' : '#1e3a8a';
                    }
                    this.calendar.addEvent({
                        id: `subsys-${sub.id}-${ev.id}`,
                        title: `${sub.name}: ${ev.label}`,
                        start: ev.start,
                        end: ev.end,
                        backgroundColor: bg,
                        borderColor: border,
                        textColor: 'white',
                        extendedProps: {
                            isSubsystemEvent: true,
                            type: ev.type,
                            subsystem: sub.name,
                            hasFile,
                            reclamation: ev.reclamation
                        }
                    });
                });
            });
        }

            } catch (err) {
                console.error('Ошибка загрузки /api/scheduler:', err);
                alert('Не удалось загрузить подсистемы: ' + err.message);
            }
            },

            //Добавляем расчет процентов длительности события от 24 часов, чтобы 
            // выносить названия событий.

            

        // ==========================
        //  ФИЛЬТРАЦИЯ ПО ДНЮ
        // ==========================
// Фильтрует события подсистемы только по выбранному дню
filteredSubsystemEvents(sub) {
    if (!this.selectedDay) return sub.subsystemevents || [];

    const dayStart = new Date(this.selectedDay);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(this.selectedDay);
    dayEnd.setHours(23, 59, 59, 999);

    return (sub.subsystemevents || []).filter(ev => {
        const s = new Date(ev.start);
        const e = new Date(ev.end);
        return e > dayStart && s < dayEnd;
    }).map(ev => ({
        ...ev,
        subsystemId: sub.id, // Добавляем ID подсистемы к каждому событию
        subsystemName: sub.name
    }));
},

// Преобразование "HH:MM" в полный RFC3339 для выбранного дня
formatTimeForToday(timeStr) {
    if (!timeStr || !this.selectedDay) return '';

    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date(this.selectedDay);
    date.setHours(h, m, 0, 0);

    // Переводим в UTC для RFC3339
    return date.toISOString();
},

// Показать детали события при клике
showEventDetails(event) {
    // Находим имя подсистемы
    const subsystem = this.subsystems.find(s => s.subsystemevents?.some(e => e.id === event.id));
    const subsystemName = subsystem ? subsystem.name : 'Неизвестно';

    this.selectedEvent = {
        ...event,
        subsystemName
    };
    this.reclamationText = event.reclamation || '';
    this.editingReclamation = false;
},

// Вычислить длительность события в минутах
eventDuration(event) {
    if (!event || !event.start || !event.end) return '-';
    const start = new Date(event.start);
    const end = new Date(event.end);
    const durationMs = end - start;
    const minutes = Math.round(durationMs / 60000);
    
    if (minutes < 60) {
        return `${minutes} мин`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}ч ${mins}мин`;
},

// Сохранить рекламацию
async saveReclamation() {
    if (!this.selectedEvent) return;

    try {
        const payload = {
            event_id: this.selectedEvent.id,
            subsystem_id: this.selectedEvent.subsystemId || this.selectedEvent.subsystem,
            reclamation: this.reclamationText
        };

        console.log('Сохраняю рекламацию:', payload);
        
        const resp = await fetch('/api/reclamation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(errorText || 'Ошибка сохранения');
        }
        
        // Обновляем событие в локальном хранилище
        this.selectedEvent.reclamation = this.reclamationText;
        this.editingReclamation = false;
        
        // Перезагружаем план подсистем
        await this.loadScheduler();
        
        alert('✅ Рекламация сохранена!');
    } catch (err) {
        console.error('Ошибка сохранения рекламации:', err);
        alert('Ошибка: ' + err.message);
    }
},


 async addSubsystemEvent() {
            try {
                // форматируем время
                  const payload = {
            ...this.newEvent,
            start: this.newEvent.start,
            end: this.newEvent.end,
        };

        console.log('Отправляем JSON:', payload); // для дебага


                const resp = await fetch('/api/scheduler', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                if (!resp.ok) {
                    const text = await resp.text();
                    throw new Error(text || 'Ошибка сервера');
                }

                const result = await resp.json();
                console.log('✅ Новое событие добавлено:', result);

  // *** НОВОЕ: добавляем событие в FullCalendar СРАЗУ ***
        if (this.calendar) {
            this.calendar.addEvent({
                id: `subsys-${Date.now()}`, // уникальный ID (пока без UUID с бэка)
                title: `${result.subsystem || this.newEvent.subsystem_id}: ${this.newEvent.label}`,
                start: payload.start,
                end: payload.end,
                backgroundColor: this.newEvent.type === 'pass' ? '#10b981' : '#ef4444',
                borderColor: this.newEvent.type === 'pass' ? '#059669' : '#dc2626',
                textColor: 'white',
                extendedProps: {
                    isSubsystemEvent: true,
                    type: this.newEvent.type,
                    subsystem: this.newEvent.subsystem_id,
                }
            });
        }



                //очистка формы
                this.newEvent = {
                    subsystem_id: 'subsys-001',
                    start: '',
                    end: '',
                    label: '',
                    type: 'pass',
                };

                await this.loadScheduler();
                alert('✅ Событие добавлено!');
            } catch (err) {
                console.error('Ошибка добавления события:', err);
                alert('Ошибка: ' + err.message);
            }
        },




    // console.log('🔄 loadScheduler вызван!');
    //     const resp = await fetch('/api/scheduler');
    //     const data = await resp.json();
    //     this.subsystems = data.subsystems || [];
    //     console.log('✅', this.subsystems);
    //     },


        // ==========================
        //  ОЧИСТКА
        // ==========================
        clearAll() {
            this.tle1 = '';
            this.tle2 = '';
            this.passes = [];
            this.selectedPass.id = null;

            if (this.calendar) {
                this.calendar.getEvents().forEach(event => {
                    if (!event.extendedProps?.isSaved && !event.extendedProps?.isSavedCup) {
                        event.remove();
                    }
                });
                console.log('🧹 Очищены рассчитанные события (Шлюз)');
            }
        },

        clearCupAll() {
            this.tle1Cup = '';
            this.tle2Cup = '';
            this.passesCup = [];
            this.selectedPassCup.id = null;

            if (this.calendar) {
                this.calendar.getEvents().forEach(event => {
                    if (!event.extendedProps?.isSaved && !event.extendedProps?.isSavedCup) {
                        event.remove();
                    }
                });
                console.log('🧹 Очищены рассчитанные события (ЦУП)');
            }
        },

       


    };
}