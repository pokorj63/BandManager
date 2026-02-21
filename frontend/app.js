document.addEventListener("DOMContentLoaded", async () => {

    // --- Prvky rozhraní ---
    const loginView = document.getElementById("login-view");
    const dashboardView = document.getElementById("dashboard-view");
    const userNameEl = document.getElementById("user-name");
    const userAvatarEl = document.getElementById("user-avatar");
    const navLinks = document.querySelectorAll(".nav-links li");
    const sections = document.querySelectorAll(".content-section");

    // --- 1. Kontrola přihlášení ---
    try {
        const res = await fetch("/auth/me");
        if (res.ok) {
            const data = await res.json();
            if (data.logged_in) {
                // Skrytí přihlášení, zobrazení aplikace
                loginView.classList.add("hidden");
                dashboardView.classList.remove("hidden");

                // Nastavení uživatele
                userNameEl.textContent = data.user.name || data.user.email;
                if (data.user.picture) {
                    userAvatarEl.src = data.user.picture;
                }

                // Inicializace EventPlaneru nebo dalších věcí by následovala zde...
            } else {
                showLogin();
            }
        } else {
            showLogin();
        }
    } catch (e) {
        console.error("Chyba při kontrole přihlášení:", e);
        showLogin();
    }

    function showLogin() {
        dashboardView.classList.add("hidden");
        loginView.classList.remove("hidden");
    }

    // --- 2. Navigace v postranním panelu ---
    navLinks.forEach(linkLi => {
        linkLi.addEventListener("click", (e) => {
            e.preventDefault();
            const targetId = e.target.closest("a").dataset.target;
            if (!targetId) return;

            // Zvýraznění aktivní položky v menu
            navLinks.forEach(li => li.classList.remove("active"));
            linkLi.classList.add("active");

            // Přepnutí viditelnosti sekcí
            sections.forEach(sec => sec.classList.add("hidden"));
            document.getElementById(targetId).classList.remove("hidden");
        });
    });

    // --- 3. EventPlaner ---
    const btnShowAddEvent = document.getElementById("btn-show-add-event");
    const btnCancelAddEvent = document.getElementById("btn-cancel-add-event");
    const formEventContainer = document.getElementById("add-event-form");
    const formEvent = document.getElementById("form-event");
    const calendarGrid = document.getElementById("calendar-grid");
    const currentMonthLabel = document.getElementById("current-month-label");
    const btnPrevMonth = document.getElementById("btn-prev-month");
    const btnNextMonth = document.getElementById("btn-next-month");

    let currentDate = new Date();

    function updateMonthLabel() {
        const months = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];
        currentMonthLabel.textContent = `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }

    async function loadEvents() {
        try {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();

            const res = await fetch(`/events/month?year=${year}&month=${month + 1}`);
            const eventsData = await res.json();

            // Seskupení událostí podle dat
            const eventsByDate = {};
            eventsData.forEach(ev => {
                const d = ev.date;
                if (!eventsByDate[d]) eventsByDate[d] = [];
                eventsByDate[d].push(ev);
            });

            // Výpočet dnů
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);

            // Kolik dnů přeskočit z předešlého měsíce (začínáme pondělím)
            let startOffset = firstDay.getDay() - 1;
            if (startOffset < 0) startOffset = 6; // Neděle

            const totalDays = lastDay.getDate();

            calendarGrid.innerHTML = "";

            // Prázdné buňky na začátku
            for (let i = 0; i < startOffset; i++) {
                const el = document.createElement("div");
                el.className = "calendar-day empty";
                calendarGrid.appendChild(el);
            }

            // Skutečné dny
            for (let d = 1; d <= totalDays; d++) {
                const cellDate = new Date(year, month, d);
                // format YYYY-MM-DD
                const dateStr = cellDate.toISOString().split("T")[0];

                const el = document.createElement("div");
                el.className = "calendar-day";
                if (eventsByDate[dateStr]) el.classList.add("has-event");

                el.innerHTML = `<div class="day-number">${d}</div>`;

                if (eventsByDate[dateStr]) {
                    eventsByDate[dateStr].forEach(ev => {
                        const evEl = document.createElement("div");
                        evEl.className = "calendar-event";
                        evEl.textContent = `${ev.time_start ? ev.time_start.substring(0, 5) : "Celý den"}: ${ev.title}`;
                        evEl.onclick = (e) => {
                            e.stopPropagation();
                            openEventDetailModal(ev);
                        };
                        el.appendChild(evEl);
                    });
                }

                // Kliknutí na volné dny => přidání
                el.onclick = () => {
                    document.getElementById("event-date").value = dateStr;
                    formEventContainer.classList.remove("hidden");
                    btnShowAddEvent.style.display = "none";
                    document.querySelector(".main-content").scrollTo({ top: formEventContainer.offsetTop - 50, behavior: 'smooth' });
                };

                calendarGrid.appendChild(el);
            }

        } catch (e) {
            console.error("Nelze načíst události:", e);
        }
    }

    // Inline Detail UI
    const detailView = document.getElementById("event-detail-view");
    const detailTitle = document.getElementById("detail-title");
    const detailDate = document.getElementById("detail-date");
    const detailLocation = document.getElementById("detail-location");
    const detailPublic = document.getElementById("detail-public-desc");
    const detailInternal = document.getElementById("detail-internal-notes");
    const zaskokyList = document.getElementById("zaskoky-list");
    const calendarGridCont = document.querySelector(".calendar-wrapper");

    let currentEventId = null;

    document.getElementById("close-detail").onclick = () => {
        detailView.classList.add("hidden");
        calendarGridCont.style.display = "block";
    };

    document.getElementById("btn-delete-event").onclick = async () => {
        if (!currentEventId) return;
        if (!confirm("Opravdu smazat tuto událost? Akce je nevratná.")) return;

        try {
            const res = await fetch(`/events/${currentEventId}`, { method: "DELETE" });
            if (res.ok) {
                detailView.classList.add("hidden");
                calendarGridCont.style.display = "block";
                loadEvents();
                alert("Událost byla úspěšně smazána.");
            } else {
                alert("Došlo k chybě při mazání události.");
            }
        } catch (e) {
            console.error(e);
            alert("Kritická chyba spojení při mazání.");
        }
    };

    function openEventDetailModal(ev) {
        currentEventId = ev.id;

        // Hide calendar to show detail view instead, matching the 'form' behavior but as request, inline open above calendar 
        // Or we just display it above. We'll leave calendar visible but show detailView
        detailView.classList.remove("hidden");
        document.querySelector(".main-content").scrollTo({ top: detailView.offsetTop - 50, behavior: 'smooth' });

        detailTitle.textContent = ev.title;

        const dateObj = new Date(ev.date);
        detailDate.textContent = `${dateObj.toLocaleDateString('cs-CZ')} ${ev.time_start ? "v " + ev.time_start.substring(0, 5) : ""}`;
        detailLocation.textContent = ev.location || "Místo neurčeno";

        detailPublic.textContent = ev.public_description || "Žádné popisy z kalendáře...";
        detailInternal.textContent = ev.internal_notes || "Zatím žádné interní poznámky...";

        zaskokyList.innerHTML = "<li>Načítám záskoky...</li>";
        renderZaskoky(ev.subs || []);

        const btnCreateLink = document.getElementById("btn-create-playlist-link");
        if (btnCreateLink) {
            btnCreateLink.onclick = () => {
                document.querySelector('a[data-target=playlistmaker]').click();
                const pmSelect = document.getElementById("pm-event-select");
                if (pmSelect) {
                    pmSelect.value = ev.id;
                    pmSelect.dispatchEvent(new Event("change"));
                }
            };
        }
    }

    function renderZaskoky(subs) {
        zaskokyList.innerHTML = "";
        if (subs.length === 0) {
            zaskokyList.innerHTML = "<p style='color: var(--text-muted)'>Žádné sháňky po záskocích.</p>";
            return;
        }
        subs.forEach(sub => {
            const li = document.createElement("li");
            li.innerHTML = `
                <div>
                    <strong>${sub.role}</strong> - 
                    <span style="color: ${sub.is_secured ? 'var(--accent)' : '#ef4444'}">
                        ${sub.is_secured ? 'ok (' + (sub.note || '') + ')' : 'shání se'}
                    </span>
                </div>
                <div>
                    <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 0.8rem;" onclick="toggleZaskok(${sub.id}, ${!sub.is_secured})">🔄</button>
                    <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 0.8rem;" onclick="deleteZaskok(${sub.id})">✖</button>
                </div>
            `;
            zaskokyList.appendChild(li);
        });
    }

    window.toggleZaskok = async (subId, novyStav) => {
        try {
            const res = await fetch(`/events/${currentEventId}/subs/${subId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_secured: novyStav })
            });
            if (res.ok) {
                // To avoid closing detail view, let's just refetch this event
                const evRes = await fetch(`/events/${currentEventId}`);
                const ev = await evRes.json();
                renderZaskoky(ev.subs || []);
                loadEvents(); // tise updatuj kalendar na pozadi
            }
        } catch (e) {
            console.error(e);
        }
    };

    window.deleteZaskok = async (subId) => {
        if (!confirm("Opravdu smazat tento záskok?")) return;
        try {
            const res = await fetch(`/events/${currentEventId}/subs/${subId}`, { method: "DELETE" });
            if (res.ok) {
                const evRes = await fetch(`/events/${currentEventId}`);
                const ev = await evRes.json();
                renderZaskoky(ev.subs || []);
                loadEvents();
            }
        } catch (e) { console.error(e); }
    };

    document.getElementById("add-zaskok-btn").onclick = async () => {
        const inputEl = document.getElementById("add-zaskok-input");
        const role = inputEl.value.trim();
        if (!role) return;
        try {
            const res = await fetch(`/events/${currentEventId}/subs`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: role, is_secured: false, note: "" })
            });
            if (res.ok) {
                inputEl.value = "";
                const evRes = await fetch(`/events/${currentEventId}`);
                const ev = await evRes.json();
                renderZaskoky(ev.subs || []);
                loadEvents();
            }
        } catch (e) { console.error(e); }
    };

    // File Upload Handlers
    const uploadMediaBtn = document.getElementById("btn-trigger-media-upload");
    const uploadMediaInput = document.getElementById("upload-media-input");
    const uploadPdfInput = document.getElementById("upload-pdf-input");

    uploadMediaBtn.onclick = () => uploadMediaInput.click();

    uploadMediaInput.onchange = async (e) => {
        if (!currentEventId) return;
        const files = e.target.files;
        if (!files.length) return;

        uploadMediaBtn.textContent = "Nahrávám...";
        for (const file of files) {
            const formData = new FormData();
            formData.append("file", file);
            let cat = "other";
            if (file.type.startsWith("image/")) cat = "photos";
            if (file.type.startsWith("video/")) cat = "videos";
            formData.append("category", cat);

            try {
                const res = await fetch(`/events/${currentEventId}/media`, {
                    method: "POST",
                    body: formData
                });
                if (!res.ok) alert(`Chyba při nahrávání souboru: ${file.name}`);
            } catch (err) {
                console.error(err);
                alert(`Nelze nahrát ${file.name}`);
            }
        }
        uploadMediaBtn.textContent = "Upload Fotek/Videí";
        alert("Soubory úspěšně nahrány!");
        e.target.value = "";
    };

    uploadPdfInput.onchange = async (e) => {
        if (!currentEventId) return;
        const file = e.target.files[0];
        if (!file) return;

        // simple indicator for PDF
        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", "other");

        try {
            const res = await fetch(`/events/${currentEventId}/media`, {
                method: "POST",
                body: formData
            });
            if (res.ok) {
                alert("Playlist byl nahrán!");
            } else {
                alert("Nepovedlo se nahrát Playlist");
            }
        } catch (err) {
            console.error(err);
        }
        e.target.value = "";
    };

    const btnSyncEvents = document.getElementById("btn-sync-events");
    btnSyncEvents.addEventListener("click", async () => {
        btnSyncEvents.textContent = "Sychronizuji...";
        btnSyncEvents.disabled = true;
        try {
            const res = await fetch("/events/sync", { method: "POST" });
            if (res.ok) {
                alert("Synchronizace Google Kalendáře proběhla úspěšně!");
                await loadEvents();
            } else {
                alert("Chyba při synchronizaci");
            }
        } catch (e) {
            console.error(e);
            alert("Kritická chyba spojení při synchronizaci.");
        } finally {
            btnSyncEvents.textContent = "🔄 Synch S Kalendářem";
            btnSyncEvents.disabled = false;
        }
    });

    btnPrevMonth.addEventListener("click", () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        updateMonthLabel();
        loadEvents();
    });

    btnNextMonth.addEventListener("click", () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        updateMonthLabel();
        loadEvents();
    });

    btnShowAddEvent.addEventListener("click", () => {
        formEventContainer.classList.remove("hidden");
        btnShowAddEvent.style.display = "none";
    });

    btnCancelAddEvent.addEventListener("click", () => {
        formEventContainer.classList.add("hidden");
        btnShowAddEvent.style.display = "block";
        formEvent.reset();
    });

    formEvent.addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            title: document.getElementById("event-title").value,
            date: document.getElementById("event-date").value,
            time_start: document.getElementById("event-time-start").value || null,
            time_end: document.getElementById("event-time-end").value || null,
            location: document.getElementById("event-location").value || null,
            public_description: document.getElementById("event-public-desc").value || null,
            internal_notes: document.getElementById("event-internal-notes").value || null
        };

        const prevBtnText = formEvent.querySelector('button[type="submit"]').textContent;
        formEvent.querySelector('button[type="submit"]').textContent = "Ukládám...";

        try {
            const res = await fetch("/events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                formEvent.reset();
                formEventContainer.classList.add("hidden");
                btnShowAddEvent.style.display = "block";
                loadEvents();
                alert("Koncert je v kalendáři a Google složka vytvořena.");
            } else {
                const err = await res.json();
                alert("Chyba při ukládání: " + JSON.stringify(err));
            }
        } catch (e) {
            console.error(e);
            alert("Kritická chyba spojení.");
        } finally {
            formEvent.querySelector('button[type="submit"]').textContent = prevBtnText;
        }
    });

    // --- 4. Zobrazení kontextové nápovědy (Mirek) ---
    const helperContainer = document.getElementById("helper-character");
    const helperText = document.getElementById("helper-text");
    const btnHelperClose = document.getElementById("helper-close");

    window.showMirek = function (text) {
        helperText.textContent = text;
        helperContainer.classList.remove("hidden");
    };

    btnHelperClose.addEventListener("click", () => {
        helperContainer.classList.add("hidden");
    });

    // --- 5. PlaylistMaker logika ---
    const pmSourceList = document.getElementById("pm-source-list");
    const pmBlocksContainer = document.getElementById("pm-blocks-container");
    const pmAddSetBtn = document.getElementById("pm-add-set");
    const pmAddNoteBtn = document.getElementById("pm-add-note");
    const pmSearch = document.getElementById("pm-search");

    // Mock data (postupně nahradíš těmi z DB)
    const mockRepertoire = [
        { id: "s1", number: "15", title: "Smells Like Teen Spirit", artist: "Nirvana", singer: "Adam", time: 270 },
        { id: "s2", number: "42", title: "Hotel California", artist: "The Eagles", singer: "Adam", time: 390 },
        { id: "s3", number: "07", title: "Billie Jean", artist: "Michael Jackson", singer: "Eva", time: 294 },
        { id: "s4", number: "99", title: "Bohemian Rhapsody", artist: "Queen", singer: "Adam", time: 355 },
        { id: "s5", number: "33", title: "Wonderwall", artist: "Oasis", singer: "Eva", time: 258 },
        { id: "s6", number: "18", title: "Sweet Child O' Mine", artist: "Guns N' Roses", singer: "Adam", time: 356 },
        { id: "s7", number: "64", title: "Don't Stop Believin'", artist: "Journey", singer: "Eva", time: 251 },
        { id: "s8", number: "21", title: "Livin' on a Prayer", artist: "Bon Jovi", singer: "Adam", time: 249 }
    ];

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    // Render zdroje
    function renderRepertoire(query = "") {
        pmSourceList.innerHTML = "";
        const filtered = mockRepertoire.filter(s =>
            s.title.toLowerCase().includes(query.toLowerCase()) ||
            s.artist.toLowerCase().includes(query.toLowerCase())
        );
        filtered.forEach(song => {
            const li = document.createElement("li");
            li.className = "pm-item";
            li.dataset.duration = song.time;
            li.innerHTML = `
                <div class="pm-item-content">
                    <div style="display: flex; align-items: center;">
                        <span style="font-size: 0.8rem; font-weight: 800; color: var(--accent); margin-right: 10px; min-width: 25px;">${song.number}</span>
                        <span class="pm-item-title">${song.title}</span>
                    </div>
                    <span class="pm-item-artist" style="margin-left: 35px;">${song.artist} <em style="opacity: 0.6;">(${song.singer})</em></span>
                </div>
                <div style="display: flex; align-items: center;">
                    <span class="pm-item-time">${formatTime(song.time)}</span>
                    <button class="btn-remove-item" onclick="this.closest('li').remove(); window.updateBlockTime({target: this.closest('.target-list')});" title="Odebrat">✖</button>
                </div>
            `;

            // Double click to add to active block
            li.addEventListener("dblclick", () => {
                const activeBlockList = document.querySelector(".pm-block.active .target-list") || document.querySelector(".target-list");
                if (activeBlockList) {
                    const clone = li.cloneNode(true);
                    // Odstraníme DblClick z klonu pro jistotu
                    clone.addEventListener("dblclick", (e) => e.preventDefault());
                    activeBlockList.appendChild(clone);
                    updateBlockTime({ target: activeBlockList });
                }
            });

            pmSourceList.appendChild(li);
        });
    }

    // Aktivace bloku na klik
    pmBlocksContainer.addEventListener("click", (e) => {
        const block = e.target.closest(".pm-block");
        if (block) {
            document.querySelectorAll(".pm-block").forEach(b => b.classList.remove("active"));
            block.classList.add("active");
        }
    });

    renderRepertoire();
    pmSearch.addEventListener("input", (e) => renderRepertoire(e.target.value));

    // Aktivace Sortable objektů
    if (typeof Sortable !== 'undefined') {
        new Sortable(pmSourceList, {
            group: {
                name: 'shared',
                pull: 'clone', // kopírovat do playlistu, nemazat ze zdroje
                put: false     // zakázat vracení
            },
            animation: 150,
            sort: false
        });
    }

    let blockCount = 1;

    function initBlockSortable(listEl) {
        if (typeof Sortable === 'undefined') return;
        new Sortable(listEl, {
            group: 'shared',
            animation: 150,
            onAdd: window.updateBlockTime,
            onUpdate: window.updateBlockTime,
            onRemove: window.updateBlockTime
        });
    }

    window.updateBlockTime = function (evt) {
        if (!evt) return;
        const listEl = evt.to || evt.target;
        if (!listEl) return;

        const blockEl = listEl.closest(".pm-block");
        if (!blockEl) return;

        let totalSeconds = 0;
        let songCount = 0;
        Array.from(listEl.children).forEach(li => {
            if (!li.classList.contains("pm-item-custom")) {
                songCount++;
            }
            if (li.dataset.duration) {
                totalSeconds += parseInt(li.dataset.duration, 10);
            }
        });

        const timeSpan = blockEl.querySelector(".pm-time");
        if (timeSpan) timeSpan.textContent = formatTime(totalSeconds);

        const countSpan = blockEl.querySelector(".pm-count");
        if (countSpan) countSpan.textContent = songCount;
    }

    const defaultTarget = document.querySelector(".target-list");
    if (defaultTarget) initBlockSortable(defaultTarget);

    pmAddSetBtn.addEventListener("click", () => {
        blockCount++;
        const blockHTML = document.createElement("div");
        document.querySelectorAll(".pm-block").forEach(b => b.classList.remove("active"));
        blockHTML.className = "pm-block glass active";
        blockHTML.dataset.blockId = blockCount;
        blockHTML.innerHTML = `
            <div class="pm-block-header">
                <input type="text" class="pm-block-title" value="${blockCount}. Blok">
                <div class="pm-block-stats">Čas: <span class="pm-time">00:00</span> | Skladby: <span class="pm-count">0</span></div>
            </div>
            <div class="pm-block-actions" style="display: flex; gap: 5px; margin-bottom: 10px;">
                <button class="btn btn-secondary btn-clear-block" style="font-size: 0.8rem; padding: 2px 8px;" onclick="window.clearBlock(this)">Vymazat vše</button>
                <button class="btn btn-secondary btn-remove-block" style="font-size: 0.8rem; padding: 2px 8px; color: #ef4444; border-color: #ef4444;" onclick="window.removeBlock(this)">Odstranit blok</button>
            </div>
            <ul class="pm-list target-list" data-block-id="${blockCount}"></ul>
        `;
        pmBlocksContainer.appendChild(blockHTML);
        initBlockSortable(blockHTML.querySelector(".target-list"));
        updateBlockHeadersVisibility();
    });

    pmAddNoteBtn.addEventListener("click", () => {
        const targetList = document.querySelector(".pm-block.active .target-list") || document.querySelector(".target-list");
        if (!targetList) return;

        const text = prompt("Napiš text (poznámka, pauza, přídavek):");
        if (!text) return;

        const li = document.createElement("li");
        li.className = "pm-item pm-item-custom";
        li.dataset.duration = "0";
        li.innerHTML = `
            <div class="pm-item-content">
                <span class="pm-item-title">${text}</span>
            </div>
            <button class="btn-help" onclick="this.closest('li').remove(); event.stopPropagation();" style="border-color: #ef4444; color: #ef4444; margin: 0;">✖</button>
        `;
        targetList.appendChild(li);
    });

    document.getElementById("pm-export-pdf").addEventListener("click", () => {
        alert("Modul generace PDF bude brzy aktivován. Zatím sbíráme data bloků ke zpracování.");
    });

    window.clearBlock = function (btn) {
        const block = btn.closest(".pm-block");
        const list = block.querySelector(".target-list");
        if (list && confirm("Opravdu vyčistit tento blok?")) {
            list.innerHTML = "";
            window.updateBlockTime({ target: list });
        }
    };

    window.removeBlock = function (btn) {
        const block = btn.closest(".pm-block");
        if (confirm("Opravdu smazat celý tento blok?")) {
            block.remove();
            updateBlockHeadersVisibility();
            // ensure there is an active block
            if (!document.querySelector(".pm-block.active") && document.querySelector(".pm-block")) {
                document.querySelector(".pm-block").classList.add("active");
            }
        }
    };

    function updateBlockHeadersVisibility() {
        const blocks = document.querySelectorAll(".pm-block");
        blocks.forEach(block => {
            const titleInput = block.querySelector(".pm-block-title");
            const removeBtn = block.querySelector(".btn-remove-block");

            if (blocks.length <= 1) {
                if (titleInput) titleInput.style.display = "none";
                if (removeBtn) removeBtn.style.display = "none";
            } else {
                if (titleInput) titleInput.style.display = "block";
                if (removeBtn) removeBtn.style.display = "inline-block";
            }
        });
    }

    async function loadUpcomingEvents() {
        try {
            // Fetch directly from existing /events to bypass uvicorn restart requirement for new endpoints
            const dStr = new Date().toISOString().split('T')[0]; // today
            const futureStr = "2030-12-31"; // sufficiently far future
            const res = await fetch(`/events?from_date=2023-01-01&to_date=${futureStr}`);
            if (res.ok) {
                const events = await res.json();
                const select = document.getElementById("pm-event-select");
                if (!select) return;

                select.innerHTML = '<option value="">-- Volný návrh --</option>';
                events.forEach(ev => {
                    const opt = document.createElement("option");
                    opt.value = ev.id;
                    const d = new Date(ev.date).toLocaleDateString("cs-CZ");
                    opt.textContent = `${d} - ${ev.title}`;
                    select.appendChild(opt);
                });

                select.addEventListener("change", (e) => {
                    const pmTitle = document.getElementById("pm-playlist-title");
                    const pmExportCalBtn = document.getElementById("pm-export-cal");

                    if (select.selectedIndex > 0) {
                        const txt = select.options[select.selectedIndex].textContent;
                        const titleOnly = txt.split(" - ").slice(1).join(" - ") || txt;
                        if (pmTitle) pmTitle.value = titleOnly;
                        if (pmExportCalBtn) {
                            pmExportCalBtn.disabled = false;
                            pmExportCalBtn.title = "";
                        }
                    } else {
                        if (pmTitle) pmTitle.value = "";
                        if (pmExportCalBtn) {
                            pmExportCalBtn.disabled = true;
                            pmExportCalBtn.title = "Vyberte událost nahoře";
                        }
                    }
                });
            }
        } catch (e) {
            console.error("Failed to load upcoming events for PM", e);
        }
    }

    // Inicializace dat
    updateMonthLabel();
    loadEvents();
    loadUpcomingEvents();
    updateBlockHeadersVisibility();

});
