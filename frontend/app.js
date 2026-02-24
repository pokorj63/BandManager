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
  navLinks.forEach((linkLi) => {
    linkLi.addEventListener("click", (e) => {
      e.preventDefault();
      const targetId = e.target.closest("a").dataset.target;
      if (!targetId) return;

      // Zvýraznění aktivní položky v menu
      navLinks.forEach((li) => li.classList.remove("active"));
      linkLi.classList.add("active");

      // Přepnutí viditelnosti sekcí
      sections.forEach((sec) => sec.classList.add("hidden"));
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
    const months = [
      "Leden",
      "Únor",
      "Březen",
      "Duben",
      "Květen",
      "Červen",
      "Červenec",
      "Srpen",
      "Září",
      "Říjen",
      "Listopad",
      "Prosinec",
    ];
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
      eventsData.forEach((ev) => {
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
        // format YYYY-MM-DD in local time
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

        const el = document.createElement("div");
        el.className = "calendar-day";
        if (eventsByDate[dateStr]) el.classList.add("has-event");

        el.innerHTML = `<div class="day-number">${d}</div>`;

        if (eventsByDate[dateStr]) {
          eventsByDate[dateStr].forEach((ev) => {
            const evEl = document.createElement("div");
            evEl.className = "calendar-event";
            evEl.textContent = ev.title; // Only title per user request
            evEl.onclick = (e) => {
              e.stopPropagation();
              openEventDetailModal(ev.id);
            };
            el.appendChild(evEl);
          });
        }

        // Kliknutí na volné dny => přidání
        el.onclick = () => {
          document.getElementById("event-date").value = dateStr;
          formEventContainer.classList.remove("hidden");
          btnShowAddEvent.style.display = "none";
          document
            .querySelector(".main-content")
            .scrollTo({
              top: formEventContainer.offsetTop - 50,
              behavior: "smooth",
            });
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
  const detailPlaylistInfo = document.getElementById("detail-playlist-info");
  const calendarGridCont = document.querySelector(".calendar-wrapper");

  let currentEventId = null;
  let editingEventId = null;

  document.getElementById("close-detail").onclick = () => {
    detailView.classList.add("hidden");
    calendarGridCont.style.display = "block";
  };

  document.getElementById("btn-delete-event").onclick = async () => {
    if (!currentEventId) return;
    if (
      !(await window.mirekConfirm(
        "Opravdu smazat tuto událost? V kalendáři bude smazána, ale POZOR: složka na Google Disku se všemi soubory (noty, audio) zůstane zachována pro jistotu.",
      ))
    )
      return;

    try {
      const res = await fetch(`/events/${currentEventId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        detailView.classList.add("hidden");
        calendarGridCont.style.display = "block";
        await loadEvents();
        await loadUpcomingEvents();
        await window.mirekAlert("Událost byla úspěšně smazána.");
      } else {
        window.mirekAlert("Došlo k chybě při mazání události.");
      }
    } catch (e) {
      console.error(e);
      window.mirekAlert("Kritická chyba spojení při mazání.");
    }
  };

  document.getElementById("btn-edit-event").onclick = () => {
    if (!currentEventId) return;
    detailView.classList.add("hidden");
    calendarGridCont.style.display = "block";

    editingEventId = currentEventId;
    const formTitle = document.querySelector("#add-event-form h3");
    if (formTitle) formTitle.textContent = "Upravit událost";

    fetch(`/events/${currentEventId}`)
      .then((r) => r.json())
      .then((ev) => {
        document.getElementById("event-title").value = ev.title || "";
        document.getElementById("event-date").value = ev.date || "";
        document.getElementById("event-time-start").value = (
          ev.time_start || ""
        ).substring(0, 5);
        document.getElementById("event-time-end").value = (
          ev.time_end || ""
        ).substring(0, 5);
        document.getElementById("event-location").value = ev.location || "";
        document.getElementById("event-public-desc").value =
          ev.public_description || "";
        document.getElementById("event-internal-notes").value =
          ev.internal_notes || "";

        formEventContainer.classList.remove("hidden");
        btnShowAddEvent.style.display = "none";
        document
          .querySelector(".main-content")
          .scrollTo({
            top: formEventContainer.offsetTop - 50,
            behavior: "smooth",
          });
      });
  };

  async function openEventDetailModal(evOrId) {
    let ev;
    // Pokud dostaneme ID (číslo nebo string), načteme data. 
    // Pokud dostaneme objekt, který už obsahuje media_items, můžeme ho použít rovnou (ušetříme request při uploadu).
    if (typeof evOrId === "object" && evOrId !== null && evOrId.media_items) {
      ev = evOrId;
    } else {
      const id = typeof evOrId === "object" ? evOrId.id : evOrId;
      try {
        const res = await fetch(`/events/${id}`);
        if (!res.ok) return;
        ev = await res.json();
      } catch (err) {
        console.error("Chyba při načítání detailu:", err);
        return;
      }
    }

    currentEventId = ev.id;

    // Zobrazit detail
    detailView.classList.remove("hidden");
    document
      .querySelector(".main-content")
      .scrollTo({ top: detailView.offsetTop - 50, behavior: "smooth" });

    detailTitle.textContent = ev.title;

    const dateObj = new Date(ev.date);
    detailDate.textContent = `${dateObj.toLocaleDateString("cs-CZ")} ${ev.time_start ? "v " + ev.time_start.substring(0, 5) : ""}`;
    detailLocation.textContent = ev.location || "Místo neurčeno";

    detailPublic.textContent =
      ev.public_description || "Žádné popisy z kalendáře...";
    detailInternal.textContent =
      ev.internal_notes || "Zatím žádné interní poznámky...";

    zaskokyList.innerHTML = "<li>Načítám záskoky...</li>";
    renderZaskoky(ev.subs || []);
    renderPlaylistInfo(ev.media_items || []);

    const btnCreateLink = document.getElementById("btn-create-playlist-link");
    if (btnCreateLink) {
      btnCreateLink.onclick = () => {
        document.querySelector("a[data-target=playlistmaker]").click();
        const pmSelect = document.getElementById("pm-event-select");
        if (pmSelect) {
          pmSelect.value = ev.id;
          pmSelect.dispatchEvent(new Event("change"));
        }
      };
    }
  }

  function renderPlaylistInfo(mediaItems) {
    if (!detailPlaylistInfo) return;
    // Prefer items with 'playlist' category, or fall back to name pattern
    const playlists = mediaItems
      .filter(
        (m) =>
          m.category === "playlist" ||
          (m.name.toLowerCase().startsWith("playlist") &&
            m.mime_type === "application/pdf"),
      )
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const playlist = playlists[0];
    if (playlist) {
      detailPlaylistInfo.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; justify-content: center;">
                    <span style="font-size: 1.5rem;">📄</span>
                    <div style="text-align: left;">
                        <strong style="display: block; color: var(--accent);">Playlist připojen</strong>
                        <a href="https://drive.google.com/file/d/${playlist.drive_file_id}/view" target="_blank" style="color: #fff; text-decoration: underline; font-size: 0.9rem;">Otevřít z Google Disku</a>
                    </div>
                </div>
            `;
      // Note: Currently we store drive_file_id, but the backend doesn't provide webViewLink in the schema yet.
      // In a real env, we'd need that link. For now I'll use the ID as placeholder or fix schema.
    } else {
      detailPlaylistInfo.textContent =
        "Zatím nebyl nahrán playlist pro tento koncert.";
    }
  }

  function renderZaskoky(subs) {
    zaskokyList.innerHTML = "";
    if (subs.length === 0) {
      zaskokyList.innerHTML =
        "<p style='color: var(--text-muted)'>Žádné sháňky po záskocích.</p>";
      return;
    }
    subs.forEach((sub) => {
      const li = document.createElement("li");
      li.innerHTML = `
                <div>
                    <strong>${sub.role}</strong> - 
                    <span style="color: ${sub.is_secured ? "var(--accent)" : "#ef4444"}">
                        ${sub.is_secured ? "ok (" + (sub.note || "") + ")" : "shání se"}
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
        body: JSON.stringify({ is_secured: novyStav }),
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
    if (!(await window.mirekConfirm("Opravdu smazat tento záskok?"))) return;
    try {
      const res = await fetch(`/events/${currentEventId}/subs/${subId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const evRes = await fetch(`/events/${currentEventId}`);
        const ev = await evRes.json();
        renderZaskoky(ev.subs || []);
        loadEvents();
      }
    } catch (e) {
      console.error(e);
    }
  };

  document.getElementById("add-zaskok-btn").onclick = async () => {
    const inputEl = document.getElementById("add-zaskok-input");
    const role = inputEl.value.trim();
    if (!role) return;
    try {
      const res = await fetch(`/events/${currentEventId}/subs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: role, is_secured: false, note: "" }),
      });
      if (res.ok) {
        inputEl.value = "";
        const evRes = await fetch(`/events/${currentEventId}`);
        const ev = await evRes.json();
        renderZaskoky(ev.subs || []);
        loadEvents();
      }
    } catch (e) {
      console.error(e);
    }
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
          body: formData,
        });
        if (!res.ok)
          window.mirekAlert(`Chyba při nahrávání souboru: ${file.name}`);
      } catch (err) {
        console.error(err);
        window.mirekAlert(`Nelze nahrát ${file.name}`);
      }
    }
    uploadMediaBtn.textContent = "Upload Fotek/Videí";
    window.mirekAlert("Soubory úspěšně nahrány!");
    e.target.value = "";
  };

  uploadPdfInput.onchange = async (e) => {
    if (!currentEventId) return;
    const file = e.target.files[0];
    if (!file) return;

    // simple indicator for PDF
    const formData = new FormData();
    formData.append("file", file);
    // category not needed for playlist_attach but we can just leave it

    try {
      const res = await fetch(`/events/${currentEventId}/playlist_attach`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        window.mirekAlert(
          "Playlist byl úspěšně vázán na událost a Google kalendář!",
        );
        // Re-fetch event to update UI
        const fresh = await fetch(`/events/${currentEventId}`).then((r) =>
          r.json(),
        );
        openEventDetailModal(fresh);
      } else {
        window.mirekAlert("Nepovedlo se nahrát Playlist.");
      }
    } catch (err) {
      console.error(err);
    }
    e.target.value = "";
  };

  const btnSyncEvents = document.getElementById("btn-sync-events");
  btnSyncEvents.addEventListener("click", async () => {
    btnSyncEvents.textContent = "Synchronizuji...";
    btnSyncEvents.disabled = true;
    try {
      const res = await fetch("/events/sync", { method: "POST" });
      if (res.ok) {
        window.mirekAlert(
          "Synchronizace s Google Kalendářem proběhla úspěšně!",
        );
        await loadEvents();
        await loadUpcomingEvents();
      } else {
        window.mirekAlert("Chyba při synchronizaci");
      }
    } catch (e) {
      console.error(e);
      window.mirekAlert("Kritická chyba spojení při synchronizaci.");
    } finally {
      btnSyncEvents.textContent = "Synchronizovat s kalendářem";
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
    editingEventId = null;
    formEvent.reset();
    const formTitle = document.querySelector("#add-event-form h3");
    if (formTitle) formTitle.textContent = "Nová událost";

    formEventContainer.classList.remove("hidden");
    btnShowAddEvent.style.display = "none";
  });

  btnCancelAddEvent.addEventListener("click", () => {
    formEventContainer.classList.add("hidden");
    btnShowAddEvent.style.display = "block";
    formEvent.reset();
    editingEventId = null;
  });

  formEvent.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      title: document.getElementById("event-title").value,
      date: document.getElementById("event-date").value,
      time_start: document.getElementById("event-time-start").value || null,
      time_end: document.getElementById("event-time-end").value || null,
      location: document.getElementById("event-location").value || null,
      public_description:
        document.getElementById("event-public-desc").value || null,
      internal_notes:
        document.getElementById("event-internal-notes").value || null,
    };

    const prevBtnText = formEvent.querySelector(
      'button[type="submit"]',
    ).textContent;
    formEvent.querySelector('button[type="submit"]').textContent = "Ukládám...";

    try {
      const method = editingEventId ? "PATCH" : "POST";
      const url = editingEventId ? `/events/${editingEventId}` : "/events";

      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        formEvent.reset();
        formEventContainer.classList.add("hidden");
        btnShowAddEvent.style.display = "block";
        await loadEvents();
        await loadUpcomingEvents();
        await window.mirekAlert(
          editingEventId
            ? "Událost byla úspěšně upravena."
            : "Koncert je v kalendáři a Google složka vytvořena.",
        );
        editingEventId = null;
      } else {
        const err = await res.json();
        window.mirekAlert("Chyba při ukládání: " + JSON.stringify(err));
      }
    } catch (e) {
      console.error(e);
      window.mirekAlert("Kritická chyba spojení.");
    } finally {
      formEvent.querySelector('button[type="submit"]').textContent =
        prevBtnText;
    }
  });

  // --- 4. Zobrazení kontextové nápovědy / Alertů / Potvrzení (Mirek) ---
  const helperContainer = document.getElementById("helper-character");
  const helperText = document.getElementById("helper-text");
  const btnHelperClose = document.getElementById("helper-close");
  const btnHelperCancel = document.getElementById("helper-cancel");

  window.showMirek = function (text) {
    return window.mirekAlert(text);
  };

  window.mirekAlert = function (msg) {
    return new Promise((resolve) => {
      helperText.textContent = msg;
      helperContainer.classList.remove("hidden");
      btnHelperCancel.style.display = "none";
      btnHelperClose.textContent = "Ok";

      btnHelperClose.onclick = () => {
        helperContainer.classList.add("hidden");
        resolve(true);
      };
    });
  };

  window.mirekConfirm = function (msg) {
    return new Promise((resolve) => {
      helperText.textContent = msg;
      helperContainer.classList.remove("hidden");
      btnHelperCancel.style.display = "inline-block";
      btnHelperCancel.textContent = "Ne";
      btnHelperClose.textContent = "Ano";

      btnHelperClose.onclick = () => {
        helperContainer.classList.add("hidden");
        resolve(true);
      };
      btnHelperCancel.onclick = () => {
        helperContainer.classList.add("hidden");
        resolve(false);
      };
    });
  };

  // --- 5. MusicArchivator logika ---
  const maSongsTbody = document.getElementById("ma-songs-tbody");
  const maInstrumentSetup = document.getElementById("ma-instrument-setup");
  const maBtnConfigInstruments = document.getElementById(
    "ma-btn-config-instruments",
  );
  const maBtnCancelInstruments = document.getElementById(
    "ma-btn-cancel-instruments",
  );
  const maBtnSaveInstruments = document.getElementById(
    "ma-btn-save-instruments",
  );

  // Databáze skladeb se nyní načítá dynamicky ze serveru přes loadSongs()

  async function loadSongs() {
    try {
      const res = await fetch("/ma/songs");
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  }

  async function renderMA() {
    if (!maSongsTbody) return;
    maSongsTbody.innerHTML =
      "<tr><td colspan='6' style='text-align:center;'>Načítám skladby...</td></tr>";

    const songs = await loadSongs();
    maSongsTbody.innerHTML = "";

    if (songs.length === 0) {
      maSongsTbody.innerHTML =
        "<tr><td colspan='6' style='text-align:center; padding: 20px; color: var(--text-muted);'>Žádné skladby v archivu. Začni přidáním první!</td></tr>";
      return;
    }

    // Seřadit: primárně podle kategorie (Standard první), pak podle čísla, pak N
    songs.sort((a, b) => {
      // Priorita kategorii: Standard je nejvýš
      if (a.category === "Standard" && b.category !== "Standard") return -1;
      if (a.category !== "Standard" && b.category === "Standard") return 1;
      
      // Pokud jsou kategorie stejné, řadíme podle čísla
      if (a.category === b.category) {
        if (a.number === "N" && b.number !== "N") return 1;
        if (a.number !== "N" && b.number === "N") return -1;
        if (a.number !== "N" && b.number !== "N")
          return (parseInt(a.number) || 0) - (parseInt(b.number) || 0);
      }
      
      // Jinak podle názvu kategorie a pak názvu písně
      const catComp = a.category.localeCompare(b.category);
      if (catComp !== 0) return catComp;
      return a.title.localeCompare(b.title);
    });

    let currentCategory = "";

    songs.forEach((song) => {
      if (song.category !== currentCategory) {
        currentCategory = song.category;
        const headTr = document.createElement("tr");
        headTr.innerHTML = `
                    <td colspan="6" style="background: rgba(255, 255, 255, 0.05); text-transform: uppercase; font-size: 0.8rem; font-weight: 800; color: var(--accent); padding: 12px 10px;">
                        ${song.category}
                    </td>
                `;
        maSongsTbody.appendChild(headTr);
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td><strong style="color: var(--accent);">${song.number}</strong></td>
                <td>
                    <div style="font-weight: 800; font-size: 1.05rem;">${song.title}</div>
                    <div style="color: var(--text-muted); font-size: 0.8rem;">Délka: ${formatTime(song.duration)}</div>
                </td>
                <td style="font-weight: 600;">${song.singer}</td>
                <td><span style="color: var(--text-muted); font-size: 0.8rem;">Vše kompletní</span></td>
                <td>
                    <a href="https://drive.google.com/drive/folders/${song.drive_folder_id}" target="_blank" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; text-decoration: none;">
                        <i class="fa-brands fa-google-drive" style="color: #10b981;"></i> Složka
                    </a>
                </td>
                <td>
                    <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem;" onclick="window.openEditSongForm(${JSON.stringify(song).replace(/"/g, "&quot;")})">✏️ Úprava</button>
                </td>
            `;
      maSongsTbody.appendChild(tr);
    });
  }

  // Vyvolat render při startu
  renderMA();

  window.openEditSongForm = function (song) {
    editingSongId = song.id;
    maAddSongForm.classList.remove("hidden");
    document.querySelector("#ma-add-song-form h3").textContent = "Upravit skladbu";
    document.getElementById("ma-btn-submit-song").textContent = "Uložit změny";
    document.getElementById("ma-btn-delete-song").classList.remove("hidden");

    document.getElementById("ma-song-number").value = song.number;
    document.getElementById("ma-song-title").value = song.title;
    document.getElementById("ma-song-singer").value = song.singer;
    document.getElementById("ma-song-category").value = song.category;
    document.getElementById("ma-song-duration").value = formatTime(song.duration);

    document
      .querySelector(".main-content")
      .scrollTo({ top: maAddSongForm.offsetTop - 50, behavior: "smooth" });
  };

  window.deleteSong = async function (id, title) {
    if (
      !(await window.mirekConfirm(
        `Opravdu smazat skladbu "${title}"? Z databáze i PM zmizí, ale složka na Disku zůstane pro jistotu zachována.`,
      ))
    )
      return;

    try {
      const res = await fetch(`/ma/songs/${id}`, { method: "DELETE" });
      if (res.ok) {
        renderMA();
        renderRepertoire();
        maAddSongForm.classList.add("hidden");
        editingSongId = null;
        window.mirekAlert("Skladba byla smazána.");
      } else {
        window.mirekAlert("Chyba při mazání skladby.");
      }
    } catch (e) {
      console.error(e);
      window.mirekAlert("Kritická chyba při spojení.");
    }
  };

  window.addInstrumentUI = function (category, data = null) {
    const containerId =
      category === "Zpěvy"
        ? "inst-list-vocals"
        : category === "Rytmika"
          ? "inst-list-rhythm"
          : "inst-list-winds";
    const container = document.getElementById(containerId);
    if (!container) return;

    const div = document.createElement("div");
    div.className = "inst-item-row";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "10px";
    div.style.marginBottom = "8px";
    div.style.background = "rgba(255,255,255,0.05)";
    div.style.padding = "5px 10px";
    div.style.borderRadius = "6px";

    const nameValue = data ? data.name : "";
    const trackedChecked = data
      ? data.is_tracked
        ? "checked"
        : ""
      : "checked";

    div.innerHTML = `
            <input type="text" placeholder="Název" value="${nameValue}" class="inst-name-input" style="flex: 1; background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 0.9rem;">
            <label style="font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 5px; white-space: nowrap;">
                <input type="checkbox" ${trackedChecked} class="inst-tracked-check"> Sledovat
            </label>
            <button class="btn-remove-item" onclick="this.closest('.inst-item-row').remove()" title="Odebrat">✖</button>
        `;
    container.appendChild(div);
  };

  maBtnConfigInstruments?.addEventListener("click", async () => {
    // Clear UI
    document.getElementById("inst-list-vocals").innerHTML = "";
    document.getElementById("inst-list-rhythm").innerHTML = "";
    document.getElementById("inst-list-winds").innerHTML = "";

    maInstrumentSetup.classList.remove("hidden");
    document
      .querySelector(".main-content")
      .scrollTo({ top: maInstrumentSetup.offsetTop - 50, behavior: "smooth" });

    try {
      const res = await fetch("/ma/instruments");
      if (res.ok) {
        const instruments = await res.json();
        if (instruments.length > 0) {
          instruments.forEach((inst) => addInstrumentUI(inst.category, inst));
        } else {
          // Default items if empty
          addInstrumentUI("Zpěvy");
          addInstrumentUI("Rytmika");
          addInstrumentUI("Dechy");
        }
      }
    } catch (e) {
      console.error(e);
    }
  });

  maBtnCancelInstruments?.addEventListener("click", () => {
    maInstrumentSetup.classList.add("hidden");
  });

  maBtnSaveInstruments?.addEventListener("click", async () => {
    const instruments = [];
    ["Zpěvy", "Rytmika", "Dechy"].forEach((cat) => {
      const containerId =
        cat === "Zpěvy"
          ? "inst-list-vocals"
          : cat === "Rytmika"
            ? "inst-list-rhythm"
            : "inst-list-winds";
      const rows = document
        .getElementById(containerId)
        .querySelectorAll(".inst-item-row");
      rows.forEach((row) => {
        const name = row.querySelector(".inst-name-input").value.trim();
        const is_tracked = row.querySelector(".inst-tracked-check").checked;
        if (name) instruments.push({ name, category: cat, is_tracked });
      });
    });

    try {
      const res = await fetch("/ma/instruments/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruments }),
      });
      if (res.ok) {
        window.mirekAlert("Nástrojový setup byl úspěšně uložen!");
        maInstrumentSetup.classList.add("hidden");
      } else {
        window.mirekAlert("Chyba při ukládání setupu.");
      }
    } catch (e) {
      console.error(e);
      window.mirekAlert("Kritická chyba spojení.");
    }
  });

  // Skladby - form logika
  let editingSongId = null;
  const maAddSongForm = document.getElementById("ma-add-song-form");
  const maBtnAddSong = document.getElementById("ma-btn-add-song");
  const maBtnCancelAddSong = document.getElementById("ma-btn-cancel-add-song");
  const maFormSong = document.getElementById("ma-form-song");

  maBtnAddSong?.addEventListener("click", () => {
    editingSongId = null;
    maFormSong.reset();
    document.querySelector("#ma-add-song-form h3").textContent = "Přidat novou skladbu";
    document.getElementById("ma-btn-submit-song").textContent = "Vytvořit skladbu a složku";
    document.getElementById("ma-btn-delete-song").classList.add("hidden");
    maAddSongForm.classList.remove("hidden");
    document
      .querySelector(".main-content")
      .scrollTo({ top: maAddSongForm.offsetTop - 50, behavior: "smooth" });
  });

  maBtnCancelAddSong?.addEventListener("click", () => {
    maAddSongForm.classList.add("hidden");
    maFormSong.reset();
    editingSongId = null;
  });

  maFormSong?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const btnSubmit = maFormSong.querySelector('button[type="submit"]');
    const originalBtnText = btnSubmit.textContent;
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Vytvářím...";

    const durationStr = document.getElementById("ma-song-duration").value;
    const durationSec = parseDuration(durationStr);

    const payload = {
      number: document.getElementById("ma-song-number").value,
      title: document.getElementById("ma-song-title").value,
      singer: document.getElementById("ma-song-singer").value,
      category: document.getElementById("ma-song-category").value.trim() || "Standard",
      duration: durationSec,
    };

    try {
      const url = editingSongId ? `/ma/songs/${editingSongId}` : "/ma/songs";
      const method = editingSongId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        window.mirekAlert(
          editingSongId
            ? "Skladba byla úspěšně upravena."
            : "Skladba úspěšně vytvořena i se složkou na Disku!",
        );
        maAddSongForm.classList.add("hidden");
        maFormSong.reset();
        editingSongId = null;
        renderMA();
        renderRepertoire();
      } else {
        const err = await res.json();
        window.mirekAlert(
          "Chyba: " + (err.detail || "Nepodařilo se uložit skladbu."),
        );
      }
    } catch (e) {
      console.error(e);
      window.mirekAlert("Kritická chyba při komunikaci se serverem: " + e.message);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = originalBtnText;
    }
  });

  document.getElementById("ma-btn-delete-song")?.addEventListener("click", () => {
    if (editingSongId) {
      const title = document.getElementById("ma-song-title").value;
      window.deleteSong(editingSongId, title);
    }
  });

  function parseDuration(str) {
    if (!str) return 0;
    const pts = str.split(":");
    if (pts.length === 2) {
      return (parseInt(pts[0]) || 0) * 60 + (parseInt(pts[1]) || 0);
    }
    return parseInt(pts[0]) || 0;
  }

  // --- 6. PlaylistMaker logika ---
  const pmSourceList = document.getElementById("pm-source-list");
  const pmBlocksContainer = document.getElementById("pm-blocks-container");
  const pmAddSetBtn = document.getElementById("pm-add-set");
  const pmAddNoteBtn = document.getElementById("pm-add-note");
  const pmSearch = document.getElementById("pm-search");

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // Render zdroje
  async function renderRepertoire(query = "") {
    if (!pmSourceList) return;
    pmSourceList.innerHTML = "<li>Načítám...</li>";

    const allSongs = await loadSongs();
    pmSourceList.innerHTML = "";

    const filtered = allSongs.filter(
      (s) =>
        s.title.toLowerCase().includes(query.toLowerCase()) ||
        s.singer.toLowerCase().includes(query.toLowerCase()),
    );

    if (filtered.length === 0) {
      pmSourceList.innerHTML = `<li style="padding: 10px; color: var(--text-muted); text-align: center;">Žádné skladby nenalezeny.</li>`;
      return;
    }

    // Seřadit stejně jako v MA
    filtered.sort((a, b) => {
      // Priorita kategorii: Standard je nejvýš
      if (a.category === "Standard" && b.category !== "Standard") return -1;
      if (a.category !== "Standard" && b.category === "Standard") return 1;

      // Pokud jsou kategorie stejné, řadíme podle čísla
      if (a.category === b.category) {
        if (a.number === "N" && b.number !== "N") return 1;
        if (a.number !== "N" && b.number === "N") return -1;
        if (a.number !== "N" && b.number !== "N")
          return (parseInt(a.number) || 0) - (parseInt(b.number) || 0);
      }

      // Jinak podle názvu kategorie a pak názvu písně
      const catComp = a.category.localeCompare(b.category);
      if (catComp !== 0) return catComp;
      return a.title.localeCompare(b.title);
    });

    let currentCategory = "";

    filtered.forEach((song) => {
      if (song.category !== currentCategory) {
        currentCategory = song.category;
        const headLi = document.createElement("li");
        headLi.style.cssText =
          "background: rgba(255, 255, 255, 0.05); text-transform: uppercase; font-size: 0.75rem; font-weight: 800; color: var(--accent); padding: 4px 10px; margin-bottom: 5px; border-radius: 4px; border: 1px solid var(--glass-border); text-align: center;";
        headLi.textContent = song.category;
        pmSourceList.appendChild(headLi);
      }

      const li = document.createElement("li");
      li.className = "pm-item";
      li.dataset.duration = song.duration;
      li.dataset.num = song.number;
      li.dataset.title = song.title;
      li.dataset.singer = song.singer;
      li.innerHTML = `
                <div class="pm-item-content">
                    <div style="display: flex; align-items: center;">
                        <span style="font-size: 0.75rem; font-weight: 800; color: var(--accent); margin-right: 8px; min-width: 22px;">${song.number}</span>
                        <span class="pm-item-title" style="font-size: 0.95rem;">${song.title}</span>
                    </div>
                    <span class="pm-item-artist" style="margin-left: 30px; opacity: 0.8; font-size: 0.75rem;">${song.singer}</span>
                </div>
                <div style="display: flex; align-items: center;">
                    <span class="pm-item-time" style="font-size: 0.85rem;">${formatTime(song.duration)}</span>
                    <button class="btn-remove-item" onclick="this.closest('li').remove(); window.updateBlockTime({target: this.closest('.target-list')});" title="Odebrat">✖</button>
                </div>
            `;

      // Double click to add to active block
      li.addEventListener("dblclick", () => {
        const activeBlockList =
          document.querySelector(".pm-block.active .target-list") ||
          document.querySelector(".target-list");
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
      document
        .querySelectorAll(".pm-block")
        .forEach((b) => b.classList.remove("active"));
      block.classList.add("active");
    }
  });

  renderRepertoire();
  pmSearch.addEventListener("input", (e) => renderRepertoire(e.target.value));

  // Aktivace Sortable objektů
  if (typeof Sortable !== "undefined") {
    new Sortable(pmSourceList, {
      group: {
        name: "shared",
        pull: "clone", // kopírovat do playlistu, nemazat ze zdroje
        put: false, // zakázat vracení
      },
      animation: 150,
      sort: false,
    });
  }

  let blockCount = 1;

  function initBlockSortable(listEl) {
    if (typeof Sortable === "undefined") return;
    new Sortable(listEl, {
      group: "shared",
      animation: 150,
      onAdd: window.updateBlockTime,
      onUpdate: window.updateBlockTime,
      onRemove: window.updateBlockTime,
    });
  }

  function updateWYSIWYGScaling() {
    const blocks = document.querySelectorAll(".pm-block");
    const showBlockTitle = blocks.length > 1;

    let totalItems = 0;
    blocks.forEach((block) => {
      const targetList = block.querySelector(".target-list");
      if (targetList) totalItems += targetList.children.length;
    });
    if (showBlockTitle) {
      totalItems += blocks.length * 2;
    }

    let baseFontSize = 20;
    let headerFontSize = 28;
    let blockTitleFontSize = 24;
    let cellPadding = 5;

    if (totalItems > 45) {
      baseFontSize = 14;
      headerFontSize = 20;
      blockTitleFontSize = 16;
      cellPadding = 2;
    } else if (totalItems > 35) {
      baseFontSize = 16;
      headerFontSize = 22;
      blockTitleFontSize = 18;
      cellPadding = 3;
    } else if (totalItems > 25) {
      baseFontSize = 18;
      headerFontSize = 26;
      blockTitleFontSize = 22;
      cellPadding = 4;
    }

    const pmTitle = document.getElementById("pm-playlist-title");
    if (pmTitle) {
      pmTitle.style.fontSize = headerFontSize + "pt";
      pmTitle.style.fontFamily = "CalibriPdf, sans-serif";
      pmTitle.style.textAlign = "center";
      pmTitle.style.width = "100%";
      pmTitle.style.textTransform = "uppercase";
      pmTitle.style.fontWeight = "bold";
      pmTitle.style.color = "#000";
      pmTitle.style.textDecoration = "underline";
      pmTitle.style.marginBottom = cellPadding * 5 + "pt";
      pmTitle.style.paddingBottom = "0";
    }

    blocks.forEach((block) => {
      const titleInput = block.querySelector(".pm-block-title");
      if (titleInput) {
        titleInput.style.fontSize = blockTitleFontSize + "pt";
        titleInput.style.textAlign = "left";
        titleInput.style.textDecoration = "underline";
      }
      const header = block.querySelector(".pm-block-header");
      if (header) {
        header.style.marginBottom = cellPadding * 2 + "pt";
      }
      const targetList = block.querySelector(".target-list");
      if (targetList) {
        Array.from(targetList.children).forEach((li) => {
          li.style.fontSize = baseFontSize + "pt";
          li.style.padding = `${cellPadding}pt 0`;

          const noteInput = li.querySelector(".pm-note-input");
          if (noteInput) {
            noteInput.style.fontSize = baseFontSize + "pt";
          }
        });
      }
    });

    // -------------------------
    // Zrušena striktní A4 paginace v náhledu, bloky jen navazují s případným plynulým přesunem
    blocks.forEach((b) => {
      b.style.marginTop = "0px";
    });
  }

  window.updateBlockTime = function (evt) {
    if (!evt) return;
    const listEl = evt.to || evt.target || evt;
    if (!listEl || !listEl.closest) return;

    const blockEl = listEl.closest(".pm-block");
    if (!blockEl) return;

    let totalSeconds = 0;
    let songCount = 0;
    let index = 1;

    Array.from(listEl.children).forEach((li) => {
      if (li.dataset.isNote !== "true") {
        songCount++;
      }
      if (li.dataset.duration) {
        totalSeconds += parseInt(li.dataset.duration, 10);
      }

      if (li.dataset.isNote !== "true") {
        const durStr = li.dataset.duration
          ? formatTime(parseInt(li.dataset.duration))
          : "";
        const numDisplay = li.dataset.num ? "(" + li.dataset.num + ")" : "";

        li.innerHTML = `
                    <div style="display: flex; width: 100%; align-items: center; justify-content: space-between;">
                        <div style="width: 30pt; font-weight: bold; text-align: left;">${index}.</div>
                        <div style="flex: 1; font-weight: bold; text-transform: uppercase;">${li.dataset.title}</div>
                        <div style="width: 45pt; font-weight: bold; text-align: left;">${numDisplay}</div>
                        <div style="width: 100pt; font-weight: bold; text-align: left;">${li.dataset.singer.toUpperCase()}</div>
                        <div style="width: auto; padding-left: 10pt; display: flex; align-items: center; justify-content: flex-end;">
                           <span style="color: #999; font-size: 0.8rem; margin-right: 8px;">${durStr}</span>
                           <button class="btn-remove-item" onclick="this.closest('li').remove(); window.updateBlockTime({target: this.closest('.target-list')});" title="Odebrat">✖</button>
                        </div>
                    </div>
                `;
        index++;
      }
    });

    const timeSpan = blockEl.querySelector(".pm-time");
    if (timeSpan) timeSpan.textContent = formatTime(totalSeconds);

    const countSpan = blockEl.querySelector(".pm-count");
    if (countSpan) countSpan.textContent = songCount;

    updateWYSIWYGScaling();
  };

  const defaultTarget = document.querySelector(".target-list");
  if (defaultTarget) initBlockSortable(defaultTarget);

  pmAddSetBtn.addEventListener("click", () => {
    blockCount++;
    const blockHTML = document.createElement("div");
    document
      .querySelectorAll(".pm-block")
      .forEach((b) => b.classList.remove("active"));
    blockHTML.className = "pm-block active";
    blockHTML.dataset.blockId = blockCount;
    blockHTML.innerHTML = `
            <div class="pm-block-header">
                <input type="text" class="pm-block-title" value="${blockCount}. Blok">
                <div class="pm-block-ui-actions">
                    <div class="pm-block-stats">Čas: <span class="pm-time">00:00</span> | Skladby: <span class="pm-count">0</span></div>
                    <button class="btn btn-secondary btn-clear-block" onclick="window.clearBlock(this)">Vymazat vše</button>
                    <button class="btn btn-secondary btn-remove-block" onclick="window.removeBlock(this)">Odstranit blok</button>
                </div>
            </div>
            <ul class="pm-list target-list" data-block-id="${blockCount}"></ul>
        `;
    pmBlocksContainer.appendChild(blockHTML);
    initBlockSortable(blockHTML.querySelector(".target-list"));
    updateBlockHeadersVisibility();
  });

  pmAddNoteBtn.addEventListener("click", () => {
    const targetList =
      document.querySelector(".pm-block.active .target-list") ||
      document.querySelector(".target-list");
    if (!targetList) return;

    const li = document.createElement("li");
    li.className = "pm-item"; // no custom red class, looks exactly like standard items
    li.dataset.duration = "0";
    li.dataset.isNote = "true";
    li.innerHTML = `
            <div class="pm-item-content" style="flex: 1;">
                <input type="text" class="pm-note-input" value="Nová poznámka" style="background: transparent; border: none; outline: none; color: inherit; font-size: 1.2rem; font-weight: bold; font-family: 'CalibriPdf', sans-serif; width: 100%;" onfocus="this.select();">
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <button class="btn-color-toggle" style="background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0;" data-color="white" title="Přepnout barvu na červenou">
                    <div style="width: 12px; height: 12px; border-radius: 50%; border: 2px solid #cccccc; background: transparent; transition: all 0.2s;" class="color-indicator"></div>
                </button>
                <button class="btn-remove-item" onclick="this.closest('li').remove(); window.updateBlockTime({target: this.closest('.target-list')});" title="Odebrat">✖</button>
            </div>
        `;

    const noteInput = li.querySelector(".pm-note-input");
    const colorToggle = li.querySelector(".btn-color-toggle");
    const indicator = colorToggle.querySelector(".color-indicator");

    // Keep dataset title synced
    li.dataset.title = noteInput.value;
    noteInput.addEventListener("input", (e) => {
      li.dataset.title = e.target.value;
    });

    colorToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (colorToggle.dataset.color === "white") {
        colorToggle.dataset.color = "red";
        indicator.style.background = "#ef4444";
        indicator.style.borderColor = "#ef4444";
        noteInput.style.color = "#ef4444";
      } else {
        colorToggle.dataset.color = "white";
        indicator.style.background = "transparent";
        indicator.style.borderColor = "#cccccc";
        noteInput.style.color = "inherit";
      }
    });

    targetList.appendChild(li);
  });

  function buildPdfDefinition() {
    const listTitle =
      document.getElementById("pm-playlist-title").value || "KAPELNÍ PLAYLIST";
    const headerTitle = listTitle.toUpperCase();

    const blocks = document.querySelectorAll(".pm-block");
    const showBlockTitle = blocks.length > 1;

    // Auto-sizing logic
    let totalItems = 0;
    blocks.forEach((block) => {
      const targetList = block.querySelector(".target-list");
      totalItems += targetList.children.length;
    });
    if (showBlockTitle) {
      totalItems += blocks.length * 2; // block titles spacing approximation
    }

    let baseFontSize = 20;
    let headerFontSize = 28;
    let blockTitleFontSize = 24;
    let cellMargin = 5;

    if (totalItems > 45) {
      baseFontSize = 14;
      headerFontSize = 20;
      blockTitleFontSize = 16;
      cellMargin = 2;
    } else if (totalItems > 35) {
      baseFontSize = 16;
      headerFontSize = 22;
      blockTitleFontSize = 18;
      cellMargin = 3;
    } else if (totalItems > 25) {
      baseFontSize = 18;
      headerFontSize = 26;
      blockTitleFontSize = 22;
      cellMargin = 4;
    }

    const content = [
      { text: headerTitle, style: "header", alignment: "center" },
    ];

    blocks.forEach((block) => {
      const blockTitle = block.querySelector(".pm-block-title").value;
      const targetList = block.querySelector(".target-list");
      if (targetList.children.length === 0) return;

      const blockStack = [];

      if (showBlockTitle) {
        blockStack.push({ text: blockTitle, style: "blockTitle" });
      }

      const tableBody = [];
      let i = 1;

      Array.from(targetList.children).forEach((li) => {
        if (li.dataset.isNote === "true") {
          const noteInput = li.querySelector(".pm-note-input");
          const colorBtn = li.querySelector(".btn-color-toggle");
          const noteText = noteInput ? noteInput.value : li.dataset.title || "";
          const isRed = colorBtn && colorBtn.dataset.color === "red";
          const pdfColor = isRed ? "#ef4444" : "#000000";

          tableBody.push([
            { text: "", margin: [0, cellMargin, 0, cellMargin] },
            {
              text: noteText,
              bold: true,
              color: pdfColor,
              margin: [0, cellMargin, 0, cellMargin],
            },
            { text: "", margin: [0, cellMargin, 0, cellMargin] },
            { text: "", margin: [0, cellMargin, 0, cellMargin] },
          ]);
        } else {
          tableBody.push([
            {
              text: i + ".",
              bold: true,
              margin: [0, cellMargin, 0, cellMargin],
            },
            {
              text: li.dataset.title.toUpperCase(),
              bold: true,
              margin: [0, cellMargin, 0, cellMargin],
            },
            {
              text: `(${li.dataset.num})`,
              bold: true,
              margin: [0, cellMargin, 0, cellMargin],
            },
            {
              text: li.dataset.singer.toUpperCase(),
              bold: true,
              margin: [0, cellMargin, 0, cellMargin],
            },
          ]);
          i++;
        }
      });

      blockStack.push({
        table: {
          widths: [30, "*", 45, 100],
          body: tableBody,
        },
        layout: "noBorders",
        margin: [20, 5, 0, 10],
      });

      // Make sure the block naturally drops down entirely to the next page if it does not fit
      // except if there is only 1 block in the playlist, so it doesn't jump out of sequence from title page
      content.push({
        stack: blockStack,
        unbreakable: blocks.length > 1,
      });
    });

    return {
      content: content,
      defaultStyle: {
        fontSize: baseFontSize,
        font: "Calibri",
        color: "#000000",
        bold: true,
      },
      styles: {
        header: {
          fontSize: headerFontSize,
          bold: true,
          decoration: "underline",
          margin: [0, 0, 0, cellMargin * 5],
        },
        blockTitle: {
          fontSize: blockTitleFontSize,
          bold: true,
          decoration: "underline",
          margin: [0, cellMargin * 3, 0, cellMargin * 2],
        },
      },
    };
  }

  async function loadCustomFonts() {
    pdfMake.vfs = pdfMake.vfs || {};
    if (!pdfMake.vfs["calibrib.ttf"]) {
      try {
        const res = await fetch("/static/calibrib.ttf");
        if (res.ok) {
          const blob = await res.blob();
          const b64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(",")[1]);
            reader.readAsDataURL(blob);
          });
          pdfMake.vfs["calibrib.ttf"] = b64;
        }
      } catch (e) {
        console.error("Custom font error:", e);
      }
    }
    pdfMake.fonts = {
      Roboto: {
        normal: "Roboto-Regular.ttf",
        bold: "Roboto-Medium.ttf",
        italics: "Roboto-Italic.ttf",
        bolditalics: "Roboto-MediumItalic.ttf",
      },
      Calibri: {
        normal: "calibrib.ttf",
        bold: "calibrib.ttf",
        italics: "calibrib.ttf",
        bolditalics: "calibrib.ttf",
      },
    };
  }

  document
    .getElementById("pm-export-pdf")
    .addEventListener("click", async () => {
      if (typeof pdfMake === "undefined") {
        alert("pdfMake kód ještě není načten ze serveru.");
        return;
      }
      document.getElementById("pm-export-pdf").textContent = "Generuji...";
      await loadCustomFonts();
      const docDef = buildPdfDefinition();
      const rawTitle =
        document.getElementById("pm-playlist-title").value || "Neznámý";
      const title = `Playlist - ${rawTitle}`;
      pdfMake.createPdf(docDef).download(`${title}.pdf`);
      document.getElementById("pm-export-pdf").textContent = "Export PDF";
    });

  const exportCalBtn = document.getElementById("pm-export-cal");
  if (exportCalBtn) {
    exportCalBtn.addEventListener("click", async () => {
      const eventId = document.getElementById("pm-event-select").value;
      if (!eventId) return;

      if (typeof pdfMake === "undefined") return;

      exportCalBtn.textContent = "Nahrávám...";
      exportCalBtn.disabled = true;

      await loadCustomFonts();

      const docDef = buildPdfDefinition();
      const rawTitle =
        document.getElementById("pm-playlist-title").value || "Neznámý";
      const title = `Playlist - ${rawTitle}`;

      pdfMake.createPdf(docDef).getBlob(async (blob) => {
        const formData = new FormData();
        formData.append("file", blob, `${title}.pdf`);
        try {
          const res = await fetch(`/events/${eventId}/playlist_attach`, {
            method: "POST",
            body: formData,
          });
          if (res.ok) {
            window.mirekAlert("Playlist byl přímo připojen do Kalendáře k události!");
          } else {
            const errData = await res.json().catch(() => ({}));
            window.mirekAlert("Mirek hlásí chybu při nahrávání: " + (errData.detail || res.statusText || "Neznámá chyba"));
          }
        } catch (e) {
          window.mirekAlert("Kritická chyba spojení při nahrávání.");
        } finally {
          exportCalBtn.textContent = "Export do kalendáře";
          exportCalBtn.disabled = false;
        }
      });
    });
  }

  window.clearBlock = async function (btn) {
    const block = btn.closest(".pm-block");
    const list = block.querySelector(".target-list");
    if (list && (await window.mirekConfirm("Opravdu vyčistit tento blok?"))) {
      list.innerHTML = "";
      window.updateBlockTime({ target: list });
    }
  };

  window.removeBlock = async function (btn) {
    const block = btn.closest(".pm-block");
    if (await window.mirekConfirm("Opravdu smazat celý tento blok?")) {
      block.remove();
      updateBlockHeadersVisibility();
      // ensure there is an active block
      if (
        !document.querySelector(".pm-block.active") &&
        document.querySelector(".pm-block")
      ) {
        document.querySelector(".pm-block").classList.add("active");
      }
    }
  };

  function updateBlockHeadersVisibility() {
    const blocks = document.querySelectorAll(".pm-block");
    blocks.forEach((block) => {
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
      const futureStr = "2030-12-31";
      const res = await fetch(
        `/events?from_date=2023-01-01&to_date=${futureStr}`,
      );
      if (res.ok) {
        const events = await res.json();
        const select = document.getElementById("pm-event-select");
        if (!select) return;

        // Zapamatovat si aktuální výběr
        const currentVal = select.value;

        select.innerHTML =
          '<option value="" style="color: black;">-- Volný návrh (Nezařazeno) --</option>';
        events.forEach((ev) => {
          const opt = document.createElement("option");
          opt.value = ev.id;
          opt.style.color = "black";
          const d = new Date(ev.date).toLocaleDateString("cs-CZ");
          opt.textContent = `${d} - ${ev.title}`;
          select.appendChild(opt);
        });

        // Obnovit výběr, pokud stále existuje
        if (currentVal) {
          select.value = currentVal;
        }
      }
    } catch (e) {
      console.error("Failed to load upcoming events for PM", e);
    }
  }

  // Registrace listeneru pro pm-event-select (pouze jednou)
  const pmEventSelect = document.getElementById("pm-event-select");
  if (pmEventSelect) {
    pmEventSelect.addEventListener("change", (e) => {
      const pmTitle = document.getElementById("pm-playlist-title");
      const pmExportCalBtn = document.getElementById("pm-export-cal");

      if (pmEventSelect.selectedIndex > 0) {
        const txt = pmEventSelect.options[pmEventSelect.selectedIndex].textContent;
        if (pmTitle) pmTitle.value = txt; // Keeps Date + Title
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

  // Inicializace dat
  updateMonthLabel();
  loadEvents();
  loadUpcomingEvents();

  // Zapnutí WYSIWYG přepočtu hned na startu
  const pmTitleInput = document.getElementById("pm-playlist-title");
  if (pmTitleInput)
    pmTitleInput.addEventListener("input", updateWYSIWYGScaling);
  updateWYSIWYGScaling();
  updateBlockHeadersVisibility();

  // A4 WYSIWYG ResizeObserver (udržet šířku okna bez horizontálního scrollování)
  const wysiwygWrapper = document.getElementById("pm-wysiwyg-wrapper");
  const scaleContainer = document.getElementById("pm-scale-container");
  const printableArea = document.getElementById("pm-printable-area");
  // Ensure styles are initialized before observing
  if (scaleContainer) {
    scaleContainer.style.position = "relative";
    scaleContainer.style.transformOrigin = "top center";
  }

  if (wysiwygWrapper && scaleContainer && printableArea) {
    const resizeObserver = new ResizeObserver(() => {
      const targetWidthPx = 800; // 595.28pt is ~794px, plus some safe margin
      const availableWidth = wysiwygWrapper.clientWidth - 40; // 20px offset left/right
      let scale = 1;

      if (availableWidth < targetWidthPx && availableWidth > 0) {
        scale = availableWidth / targetWidthPx;
      }

      const adjuster = document.getElementById("pm-scale-height-adjuster");
      if (adjuster) {
        scaleContainer.style.transform = `scale(${scale})`;
        // Set the adjuster to the new scaled physical height
        // Default height is set by updateWYSIWYGScaling (total pages * height).
        // Or if it's currently unset, we can read the raw height.
        adjuster.style.height = scaleContainer.offsetHeight * scale + "px";
      }
    });

    // Sledovat změnu velikosti okna/stránky
    resizeObserver.observe(wysiwygWrapper);
    // Sledovat změnu obsahu (natáhnutí/zkrácení papíru)
    resizeObserver.observe(printableArea);
  }
});
