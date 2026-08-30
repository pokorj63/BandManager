document.addEventListener("DOMContentLoaded", async () => {
  // --- Prvky rozhraní ---
  const loginView = document.getElementById("login-view");
  const dashboardView = document.getElementById("dashboard-view");
  const userNameEl = document.getElementById("user-name");
  const userAvatarEl = document.getElementById("user-avatar");
  const navLinks = document.querySelectorAll(".nav-links li");
  const sections = document.querySelectorAll(".content-section");
  const sidebar = document.getElementById("sidebar");
  const btnToggleSidebar = document.getElementById("btn-toggle-sidebar");

  // --- Sidebar Collapse Logic ---
  const isCollapsed = localStorage.getItem("sidebarCollapsed") === "true";
  if (isCollapsed) {
    sidebar.classList.add("collapsed");
  }

  btnToggleSidebar.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    localStorage.setItem(
      "sidebarCollapsed",
      sidebar.classList.contains("collapsed"),
    );
  });

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

      if (targetId === "musicarchivator") {
        loadMADocLinks();
      }
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
          document.querySelector(".main-content").scrollTo({
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
        document.querySelector(".main-content").scrollTo({
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

    // Reset file input values
    const pdfIn = document.getElementById("upload-pdf-input");
    if (pdfIn) pdfIn.value = "";

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

    const calendarBtn = document.getElementById("btn-open-calendar");
    if (calendarBtn && ev.calendar_event_id) {
      // Odkaz do Google Kalendáře pro konkrétní událost
      const calId =
        "e07e81e11cfca0e7af8b92264670fa5526de10a89b502c0f4c58a8634fa0682b@group.calendar.google.com";
      calendarBtn.href = `https://www.google.com/calendar/event?eid=${btoa(ev.calendar_event_id + " " + calId).replace(/=/g, "")}`;
    } else if (calendarBtn) {
      calendarBtn.href = "#";
    }

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
        <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 8px; color: #fff; font-weight: 700; font-size: 0.95rem;">
              <i class="fa-solid fa-file-lines" style="color: var(--accent);"></i>
              <span>${playlist.name || "Přiložený playlist"}</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              <a href="https://drive.google.com/file/d/${playlist.drive_file_id}/view" target="_blank" class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;" title="Otevřít na Google Disku">
                <i class="fa-brands fa-google-drive"></i> Disk
              </a>
              <a href="/events/${currentEventId}/playlist_pdf" target="_blank" class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;" title="Otevřít v novém okně / stáhnout">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> Samostatně
              </a>
            </div>
          </div>
          <div style="width: 100%; height: 320px; border-radius: 10px; overflow: hidden; border: 1px solid var(--glass-border); background: #161622; position: relative;">
            <iframe src="/events/${currentEventId}/playlist_pdf#toolbar=0&navpanes=0" style="width: 100%; height: 100%; border: none; display: block;" title="Náhled přiloženého playlistu"></iframe>
          </div>
        </div>
      `;
    } else {
      detailPlaylistInfo.innerHTML = `
        <div style="color: var(--text-muted); font-size: 0.9rem; padding: 20px 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center;">
          <i class="fa-regular fa-file-lines" style="font-size: 1.5rem; opacity: 0.4;"></i>
          <span>Zatím nebyl nahrán playlist pro tento koncert.</span>
        </div>
      `;
    }
  }

  function renderZaskoky(subs) {
    zaskokyList.innerHTML = "";
    if (subs.length === 0) {
      zaskokyList.innerHTML =
        "<p style='color: var(--text-muted); margin: 6px 0; font-size: 0.85rem; text-align: center;'>Žádné sháňky po záskocích.</p>";
      return;
    }
    subs.forEach((sub) => {
      const li = document.createElement("li");
      li.style.display = "flex";
      li.style.justifyContent = "space-between";
      li.style.alignItems = "center";
      li.style.background = "rgba(0, 0, 0, 0.25)";
      li.style.border = "1px solid var(--glass-border)";
      li.style.padding = "8px 12px";
      li.style.borderRadius = "10px";
      li.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <strong style="color: #fff; font-size: 0.95rem;">${sub.role}</strong>
          <span style="font-size: 0.75rem; font-weight: 700; padding: 2px 8px; border-radius: 12px; background: ${sub.is_secured ? "rgba(255, 255, 255, 0.08)" : "rgba(205, 33, 60, 0.2)"}; color: ${sub.is_secured ? "#cbd5e1" : "var(--accent)"}; border: 1px solid ${sub.is_secured ? "rgba(255, 255, 255, 0.15)" : "rgba(205, 33, 60, 0.4)"};">
            ${sub.is_secured ? "✓ Zařízeno" : "Shání se"}
          </span>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-primary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="generateZaskokFolder(${sub.id}, this)" title="Vygenerovat složku not s party pro tento záskok"><i class="fa-solid fa-folder-plus"></i></button>
          <button class="btn btn-ghost" style="padding: 4px 10px; font-size: 0.8rem;" onclick="toggleZaskok(${sub.id}, ${!sub.is_secured})" title="Přepnout stav (Zařízeno / Shání se)"><i class="fa-solid fa-rotate"></i></button>
          <button class="btn btn-danger" style="padding: 4px 10px; font-size: 0.8rem;" onclick="deleteZaskok(${sub.id})" title="Smazat záznam"><i class="fa-solid fa-xmark"></i></button>
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

  window.generateZaskokFolder = async (subId, btn) => {
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btn.disabled = true;
    try {
      const res = await fetch(
        `/events/${currentEventId}/subs/${subId}/generate_folder`,
        {
          method: "POST",
        },
      );
      if (res.ok) {
        const data = await res.json();
        window.mirekAlert(
          `Složka pro záskok vytvořena! Zkopírováno ${data.copied_count} not.`,
        );
      } else {
        const err = await res.json().catch(() => ({}));
        window.mirekAlert(
          "Chyba: " + (err.detail || res.statusText || "Nepovedlo se vytvořit složku."),
        );
      }
    } catch (e) {
      console.error(e);
      window.mirekAlert("Kritická chyba spojení při generování složky záskoku.");
    } finally {
      btn.innerHTML = origHtml;
      btn.disabled = false;
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
  const uploadPdfInput = document.getElementById("upload-pdf-input");

  uploadPdfInput.onchange = async (e) => {
    if (!currentEventId) return;
    const file = e.target.files[0];
    if (!file) return;

    const labelText = document.getElementById("label-upload-pdf-text");
    const origText = labelText ? labelText.textContent : "Nahrát z PC (PDF)";
    if (labelText) labelText.textContent = "Nahrávám...";

    const formData = new FormData();
    formData.append("file", file);

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
        loadEvents();
      } else {
        const errData = await res.json().catch(() => ({}));
        window.mirekAlert(
          "Chyba při nahrávání playlistu: " +
            (errData.detail || res.statusText || "Nepovedlo se nahrát Playlist."),
        );
      }
    } catch (err) {
      console.error(err);
      window.mirekAlert("Kritická chyba spojení při nahrávání playlistu.");
    } finally {
      if (labelText) labelText.textContent = origText;
      e.target.value = "";
    }
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

  // --- 4. Zobrazení kontextové nápovědy / Alertů / Potvrzení ---
  const helperContainer = document.getElementById("helper-character");
  const helperText = document.getElementById("helper-text");
  const btnHelperClose = document.getElementById("helper-close");
  const btnHelperCancel = document.getElementById("helper-cancel");

  window.showHelp = function (text) {
    return window.mirekAlert(text);
  };
  window.showMirek = window.showHelp;

  window.mirekAlert = function (msg) {
    return new Promise((resolve) => {
      helperText.textContent = msg;
      helperContainer.classList.remove("hidden");
      btnHelperCancel.style.display = "none";
      btnHelperClose.textContent = "Rozumím";

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
  const maSearch = document.getElementById("ma-search");

  let instrumentsCache = [];
  let maSongsCache = [];
  let currentSongIdForUpload = null;
  let currentSongTitleForUpload = "";
  let filesToUpload = []; // { file, type, instrumentName }

  async function refreshInstrumentsCache() {
    try {
      const res = await fetch("/ma/instruments");
      if (res.ok) {
        instrumentsCache = await res.json();

        // Aktualizace selectu pro záskoky
        const zaskokSelect = document.getElementById("add-zaskok-input");
        if (zaskokSelect) {
          zaskokSelect.innerHTML =
            '<option value="">Vyber zástupný nástroj...</option>';
          instrumentsCache.forEach((inst) => {
            const opt = document.createElement("option");
            opt.value = inst.name;
            opt.textContent = inst.name;
            zaskokSelect.appendChild(opt);
          });
        }
      }
    } catch (e) {
      console.error("Chyba při načítání nástrojů:", e);
    }
  }

  // Načíst hned při startu MA v budoucnu nebo hned teď
  refreshInstrumentsCache();

  async function loadMADocLinks() {
    // jen pro budoucí použití – tlačítka mají vlastní handlery níže
  }

  // Handler pro tlačítka – generuje dokument a hned otevírá
  async function handleDocButton(btnId, docKey) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generuji...';
    btn.style.pointerEvents = "none";

    // Otevřeme prázdný tab HNED (synchronně) – jinak ho prohlížeč zablokuje
    const newTab = window.open("", "_blank");

    try {
      const res = await fetch("/ma/documents/generate", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Chyba serveru");
      }
      const links = await res.json();
      const url = links[docKey];
      if (url && newTab) {
        newTab.location.href = url;
      } else {
        if (newTab) newTab.close();
        window.mirekAlert(
          "Dokument se nepodařilo vytvořit. Zkontroluj, zda máš nastavené BAND_DRIVE_ROOT_FOLDER_ID.",
        );
      }
    } catch (e) {
      console.error(e);
      if (newTab) newTab.close();
      window.mirekAlert("Chyba při generování dokumentu: " + e.message);
    } finally {
      btn.innerHTML = origText;
      btn.style.pointerEvents = "";
    }
  }

  document
    .getElementById("ma-link-current-list")
    ?.addEventListener("click", (e) => {
      e.preventDefault();
      handleDocButton("ma-link-current-list", "current_list");
    });

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

  async function renderMA(query = "") {
    if (!maSongsTbody) return;
    if (query === "") {
      maSongsTbody.innerHTML =
        "<tr><td colspan='6' style='text-align:center;'>Načítám skladby...</td></tr>";
    }

    const songs = await loadSongs();
    maSongsCache = songs;
    maSongsTbody.innerHTML = "";

    const filteredSongs = songs.filter(
      (s) =>
        s.title.toLowerCase().includes(query.toLowerCase()) ||
        (s.singer && s.singer.toLowerCase().includes(query.toLowerCase())) ||
        String(s.number).toLowerCase().includes(query.toLowerCase()),
    );

    if (filteredSongs.length === 0) {
      maSongsTbody.innerHTML =
        "<tr><td colspan='6' style='text-align:center; padding: 20px; color: var(--text-muted);'>Žádné skladby neodpovídají hledání. Začni přidáním první!</td></tr>";
      return;
    }

    // Seřadit: primárně podle kategorie (Standard první), pak podle čísla, pak N
    const isStandardCat = (cat) =>
      cat === "Standard" || cat === "Standardní repertoár";
    const catDisplayName = (cat) =>
      isStandardCat(cat) ? "Standardní repertoár" : cat;

    filteredSongs.sort((a, b) => {
      // Standardní repertoár vždy první
      const aStd = isStandardCat(a.category);
      const bStd = isStandardCat(b.category);
      if (aStd && !bStd) return -1;
      if (!aStd && bStd) return 1;

      // Pokud jsou kategorie stejné, řadíme podle čísla
      if (a.category === b.category || (aStd && bStd)) {
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

    filteredSongs.forEach((song) => {
      if (song.category !== currentCategory) {
        currentCategory = song.category;
        const headTr = document.createElement("tr");
        headTr.innerHTML = `
                    <td colspan="6" style="background: rgba(255, 255, 255, 0.05); text-transform: uppercase; font-size: 0.8rem; font-weight: 800; color: var(--accent); padding: 12px 10px;">
                        ${catDisplayName(song.category)}
                    </td>
                `;
        maSongsTbody.appendChild(headTr);
      }

      // Výpočet chybějících partů
      const tracked = instrumentsCache.filter((i) => i.is_tracked);
      const missing = [];
      tracked.forEach((inst) => {
        const hasFile =
          song.files &&
          song.files.some(
            (f) => f.file_type === "part" && f.instrument_name === inst.name,
          );
        if (!hasFile) missing.push(inst.name);
      });

      let missingHtml = "";
      if (missing.length === 0) {
        missingHtml = `<span style="color: #10b981; font-size: 0.8rem;"><i class="fa-solid fa-check-double"></i> Vše kompletní</span>`;
      } else if (missing.length === tracked.length && tracked.length > 0) {
        missingHtml = `<span style="color: #fb923c; font-size: 0.8rem; font-weight: 600;">Chybí celé</span>`;
      } else if (missing.length > 5) {
        const displayed = missing.slice(0, 5).join(", ");
        missingHtml = `<span style="color: var(--text-muted); font-size: 0.8rem;">Chybí: ${displayed} a další...</span>`;
      } else {
        missingHtml = `<span style="color: var(--text-muted); font-size: 0.8rem;">Chybí: ${missing.join(", ")}</span>`;
      }

      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td><strong style="color: var(--accent);">${song.number}</strong></td>
                <td>
                    <div style="font-weight: 800; font-size: 1.05rem;">${song.title}</div>
                    <div style="color: var(--text-muted); font-size: 0.8rem;">Délka: ${formatTime(song.duration)}</div>
                </td>
                <td style="font-weight: 600;">${song.singer}</td>
                <td>${missingHtml}</td>
                <td>
                    <a href="https://drive.google.com/drive/folders/${song.drive_folder_id}" target="_blank" class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem; text-decoration: none; white-space: nowrap;" title="Otevřít složku skladby na Google Disku">
                        <i class="fa-brands fa-google-drive"></i> Otevřít Disk
                    </a>
                </td>
                <td>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem; white-space: nowrap;" onclick="window.openEditSongForm(${JSON.stringify(song).replace(/"/g, "&quot;")})" title="Upravit podrobnosti o skladbě"><i class="fa-solid fa-pen"></i> Upravit</button>
                        <button class="btn btn-primary" style="padding: 4px 10px; font-size: 0.8rem; white-space: nowrap;" onclick="window.triggerUpload(${song.id})" title="Nahrát noty (soubory nebo složku)"><i class="fa-solid fa-cloud-arrow-up"></i> Nahrát noty</button>
                    </div>
                </td>
            `;
      maSongsTbody.appendChild(tr);
    });
  }

  // Vyvolat render při startu
  (async () => {
    await refreshInstrumentsCache();
    renderMA();
  })();

  if (maSearch) {
    maSearch.addEventListener("input", (e) => renderMA(e.target.value));
  }

  window.openEditSongForm = function (song) {
    editingSongId = song.id;
    maAddSongForm.classList.remove("hidden");
    document.querySelector("#ma-add-song-form h3").textContent =
      "Upravit skladbu";
    document.getElementById("ma-btn-submit-song").textContent = "Uložit změny";
    document.getElementById("ma-btn-delete-song").classList.remove("hidden");

    document.getElementById("ma-song-number").value = song.number;
    document.getElementById("ma-song-title").value = song.title;
    document.getElementById("ma-song-singer").value = song.singer;
    document.getElementById("ma-song-category").value = song.category;
    document.getElementById("ma-song-duration").value = formatTime(
      song.duration,
    );

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
    div.className = "inst-item-row glass-row";

    const nameValue = data ? data.name : "";
    const trackedChecked = data
      ? data.is_tracked
        ? "checked"
        : ""
      : "checked";

    div.innerHTML = `
            <input type="text" placeholder="Název" value="${nameValue}" class="inst-name-input">
            <label class="inst-tracked-label">
                <input type="checkbox" ${trackedChecked} class="inst-tracked-check"> Sledovat
            </label>
            <button class="btn-remove-inst" onclick="this.closest('.inst-item-row').remove()" title="Odebrat">
                <i class="fas fa-trash-alt"></i>
            </button>
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
        await refreshInstrumentsCache();
        renderMA();
        loadMADocLinks();
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
    document.querySelector("#ma-add-song-form h3").textContent =
      "Přidat novou skladbu";
    document.getElementById("ma-btn-submit-song").textContent =
      "Vytvořit skladbu a složku";
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
      category:
        document.getElementById("ma-song-category").value.trim() ||
        "Standardní repertoár",
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
        loadMADocLinks();
        renderRepertoire();
      } else {
        const err = await res.json();
        window.mirekAlert(
          "Chyba: " + (err.detail || "Nepodařilo se uložit skladbu."),
        );
      }
    } catch (e) {
      console.error(e);
      window.mirekAlert(
        "Kritická chyba při komunikaci se serverem: " + e.message,
      );
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = originalBtnText;
    }
  });

  document
    .getElementById("ma-btn-delete-song")
    ?.addEventListener("click", () => {
      if (editingSongId) {
        const title = document.getElementById("ma-song-title").value;
        window.deleteSong(editingSongId, title);
      }
    });

  // --- Logic pro nahrávání materiálů ---
  const maUploadPanel = document.getElementById("ma-upload-panel");
  const maFolderInput = document.getElementById("ma-folder-input");
  const maFileInput = document.getElementById("ma-file-input");
  const maFilesList = document.getElementById("ma-upload-files-list");
  const maBtnConfirmUpload = document.getElementById("ma-btn-confirm-upload");
  const maBtnCancelUpload = document.getElementById("ma-btn-cancel-upload");
  const maUploadModalClose = document.getElementById("ma-upload-modal-close");

  window.triggerUpload = function (songId) {
    currentSongIdForUpload = songId;
    const song = maSongsCache.find((s) => s.id === songId);
    currentSongTitleForUpload = song ? song.title : "";
    const songTitleEl = document.getElementById("ma-upload-song-title");
    if (songTitleEl) songTitleEl.textContent = currentSongTitleForUpload ? `– ${currentSongTitleForUpload}` : "";
    maFileInput.click();
  };

  window.triggerFileUpload = window.triggerUpload;

  window.triggerFolderUpload = function (songId) {
    currentSongIdForUpload = songId;
    const song = maSongsCache.find((s) => s.id === songId);
    currentSongTitleForUpload = song ? song.title : "";
    const songTitleEl = document.getElementById("ma-upload-song-title");
    if (songTitleEl) songTitleEl.textContent = currentSongTitleForUpload ? `– ${currentSongTitleForUpload}` : "";
    maFolderInput.click();
  };

  async function getAllFileEntries(dataTransferItemList) {
    const fileEntries = [];
    const queue = [];
    for (let i = 0; i < dataTransferItemList.length; i++) {
      const item = dataTransferItemList[i];
      if (item.webkitGetAsEntry) {
        const entry = item.webkitGetAsEntry();
        if (entry) queue.push(entry);
      } else if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) fileEntries.push(file);
      }
    }

    while (queue.length > 0) {
      const entry = queue.shift();
      if (entry.isFile) {
        const file = await new Promise((resolve) => entry.file(resolve));
        if (file) fileEntries.push(file);
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const entries = await new Promise((resolve) => {
          dirReader.readEntries(resolve, () => resolve([]));
        });
        for (const child of entries) {
          queue.push(child);
        }
      }
    }
    return fileEntries;
  }

  let pdfSplitMode = false;
  let splitPdfFile = null;
  let splitSegments = [];

  async function processSelectedFiles(files) {
    if (!files || files.length === 0) return;

    maUploadPanel.classList.remove("hidden");
    maUploadPanel.scrollIntoView({ behavior: "smooth", block: "start" });

    // Pokud je vybrán jeden PDF soubor, zkusíme spustit chytrý PDF splitter
    const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith(".pdf"));
    if (files.length === 1 && pdfFiles.length === 1) {
      const pdfFile = pdfFiles[0];
      await analyzeAndDisplaySplitPdf(pdfFile);
      return;
    }

    // Jinak standardní více-souborové nahrávání
    pdfSplitMode = false;
    splitPdfFile = null;
    splitSegments = [];

    const matchedInstruments = new Set();
    filesToUpload = files.map((file) => {
      // Předáme název písně pro inteligentnější ořezání šumu v názvu souboru
      const { type, instrumentName } = guessFileType(
        file.name,
        matchedInstruments,
        currentSongTitleForUpload,
      );
      if (type === "part" && instrumentName) {
        matchedInstruments.add(instrumentName);
      }
      return { file, type, instrumentName };
    });

    renderFilesToUpload();

    // Pokud obsahuje PDF soubory, pošleme je na backend pro dodatečné ověření ze záhlaví
    const hasPdfs = files.some(f => f.name.toLowerCase().endsWith(".pdf"));
    if (hasPdfs) {
      try {
        const formData = new FormData();
        files.forEach(f => formData.append("files", f));
        const res = await fetch(`/ma/songs/${currentSongIdForUpload}/analyze_files`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const analyzed = await res.json();
          analyzed.forEach((item, idx) => {
            if (filesToUpload[idx] && item.file_type !== "other") {
              if (filesToUpload[idx].type === "other" || (!filesToUpload[idx].instrumentName && item.instrument_name)) {
                filesToUpload[idx].type = item.file_type;
                filesToUpload[idx].instrumentName = item.instrument_name;
              }
            }
          });
          renderFilesToUpload();
        }
      } catch (err) {
        console.warn("Background file analysis fallback:", err);
      }
    }
  }

  async function analyzeAndDisplaySplitPdf(pdfFile) {
    pdfSplitMode = true;
    splitPdfFile = pdfFile;
    splitSegments = [];
    filesToUpload = [];

    if (maBtnConfirmUpload) {
      maBtnConfirmUpload.disabled = true;
      maBtnConfirmUpload.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Analyzuji PDF...`;
    }

    maFilesList.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 35px 20px; gap: 12px; color: var(--text-muted); text-align: center;">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 2.2rem; color: var(--accent);"></i>
        <div style="font-weight: 700; color: #fff; font-size: 1.05rem;">Analyzuji stránky a záhlaví PDF (${pdfFile.name})...</div>
        <div style="font-size: 0.85rem;">Detekuji partituru, nástroje a chybějící party pro kapelu.</div>
      </div>
    `;

    try {
      const formData = new FormData();
      formData.append("file", pdfFile);

      const res = await fetch(`/ma/songs/${currentSongIdForUpload}/analyze_pdf`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Chyba při analýze PDF");
      }

      const data = await res.json();
      if (!data.segments || data.segments.length === 0 || data.total_pages <= 1) {
        // Jednostránkový nebo nerozpoznaný PDF -> přepnout na standardní zobrazení
        pdfSplitMode = false;
        splitPdfFile = null;
        splitSegments = [];
        const matched = new Set();
        const { type, instrumentName } = guessFileType(pdfFile.name, matched, currentSongTitleForUpload);
        filesToUpload = [{ file: pdfFile, type, instrumentName }];
        renderFilesToUpload();
        return;
      }

      splitSegments = data.segments.map(seg => ({
        ...seg,
        selected: seg.is_missing || seg.file_type === "score" || (!seg.already_exists && seg.file_type === "part"),
      }));

      renderSplitPdfSegments(data);
    } catch (e) {
      console.error(e);
      // Fallback na standardní nahrávání
      pdfSplitMode = false;
      splitPdfFile = null;
      splitSegments = [];
      const matched = new Set();
      const { type, instrumentName } = guessFileType(pdfFile.name, matched, currentSongTitleForUpload);
      filesToUpload = [{ file: pdfFile, type, instrumentName }];
      renderFilesToUpload();
    }
  }

  function renderSplitPdfSegments(data) {
    if (!maFilesList) return;
    maFilesList.innerHTML = "";

    const missingCount = splitSegments.filter(s => s.is_missing).length;

    // Header info banner
    const banner = document.createElement("div");
    banner.style = "background: rgba(205, 33, 60, 0.12); border: 1px solid rgba(205, 33, 60, 0.35); border-radius: 12px; padding: 12px 16px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;";
    banner.innerHTML = `
      <div>
        <div style="font-weight: 700; color: #fff; font-size: 0.95rem; display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-wand-magic-sparkles" style="color: var(--accent);"></i> Chytrý PDF Splitter
          <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal;">(${data.filename || (splitPdfFile ? splitPdfFile.name : "")} – ${data.total_pages ? data.total_pages + " stran, " : ""}nalezeno ${splitSegments.length} oddílů)</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
          ${missingCount > 0 ? `<strong style="color: #4ade80;">✨ Nalezeno ${missingCount} chybějících partů</strong> pro tuto skladbu.` : `Všechny nalezené party jsou připraveny k rozdělení a nahrání.`}
        </div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button type="button" class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="window.maSelectAllSegments(true)">Vybrat vše</button>
        <button type="button" class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="window.maSelectOnlyMissingSegments()">Jen chybějící</button>
        <button type="button" class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="window.maSelectAllSegments(false)">Odznačit vše</button>
      </div>
    `;
    maFilesList.appendChild(banner);

    // List of segments
    splitSegments.forEach((seg, index) => {
      const div = document.createElement("div");
      div.className = "glass-row";
      div.style = "justify-content: space-between; gap: 12px; padding: 10px 14px; align-items: center;";

      const partsOptions = instrumentsCache
        .map(
          (inst) =>
            `<option value="part:${inst.name}" ${
              seg.file_type === "part" && seg.instrument_name === inst.name
                ? "selected"
                : ""
            }>Part: ${inst.name}</option>`,
        )
        .join("");

      let statusBadge = "";
      if (seg.is_missing) {
        statusBadge = `<span style="background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; white-space: nowrap;">✨ Chybějící part</span>`;
      } else if (seg.file_type === "score") {
        statusBadge = `<span style="background: rgba(255, 255, 255, 0.1); color: #fff; border: 1px solid rgba(255, 255, 255, 0.2); font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; white-space: nowrap;">Partitura</span>`;
      } else if (seg.already_exists) {
        statusBadge = `<span style="background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3); font-size: 0.72rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; white-space: nowrap;">⚠️ Přepíše existující</span>`;
      }

      div.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">
          <input type="checkbox" ${seg.selected ? "checked" : ""} style="cursor: pointer; width: 16px; height: 16px; accent-color: var(--accent); flex-shrink: 0;" onchange="window.toggleSplitSegmentSelect(${index}, this.checked)">
          <div style="display: flex; flex-direction: column; min-width: 0; flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-weight: 700; font-size: 0.95rem; color: #fff;">${seg.title}</span>
              ${statusBadge}
              <span style="font-size: 0.8rem; color: var(--text-muted); background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 6px;">
                Str. ${seg.page_start}${seg.page_start !== seg.page_end ? `–${seg.page_end}` : ""} (${seg.page_count} ${seg.page_count === 1 ? 'strana' : seg.page_count < 5 ? 'strany' : 'stran'})
              </span>
            </div>
            ${seg.header_snippet ? `<span style="font-size: 0.75rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;" title="${seg.header_snippet}">Záhlaví: ${seg.header_snippet}</span>` : ""}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <select style="background: rgba(0,0,0,0.4); color: white; border: 1px solid var(--glass-border); border-radius: 6px; padding: 5px 8px; font-size: 0.85rem; cursor: pointer;" onchange="window.updateSplitSegmentAssignment(${index}, this.value)">
            <option value="score" ${seg.file_type === "score" ? "selected" : ""}>Partitura</option>
            ${partsOptions}
            <option value="other" ${seg.file_type === "other" ? "selected" : ""}>Jiné</option>
          </select>
          <button type="button" class="btn btn-secondary" onclick="window.removeSplitSegment(${index})" title="Odebrat z výběru" style="padding: 5px 10px;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `;
      maFilesList.appendChild(div);
    });

    updateConfirmUploadButtonText();
  }

  window.toggleSplitSegmentSelect = function (index, isChecked) {
    if (splitSegments[index]) {
      splitSegments[index].selected = isChecked;
      updateConfirmUploadButtonText();
    }
  };

  window.updateSplitSegmentAssignment = function (index, value) {
    if (!splitSegments[index]) return;
    if (value.startsWith("part:")) {
      splitSegments[index].file_type = "part";
      splitSegments[index].instrument_name = value.split("part:")[1];
      splitSegments[index].title = `Part: ${splitSegments[index].instrument_name}`;
    } else if (value === "score") {
      splitSegments[index].file_type = "score";
      splitSegments[index].instrument_name = null;
      splitSegments[index].title = "Partitura";
    } else {
      splitSegments[index].file_type = "other";
      splitSegments[index].instrument_name = null;
      splitSegments[index].title = `Jiné (str. ${splitSegments[index].page_start}–${splitSegments[index].page_end})`;
    }
  };

  window.removeSplitSegment = function (index) {
    splitSegments.splice(index, 1);
    if (splitSegments.length === 0) {
      pdfSplitMode = false;
      splitPdfFile = null;
      maUploadPanel.classList.add("hidden");
      return;
    }
    renderSplitPdfSegments({ filename: splitPdfFile ? splitPdfFile.name : "", total_pages: 0 });
  };

  window.maSelectAllSegments = function (select) {
    splitSegments.forEach(seg => { seg.selected = select; });
    renderSplitPdfSegments({ filename: splitPdfFile ? splitPdfFile.name : "", total_pages: 0 });
  };

  window.maSelectOnlyMissingSegments = function () {
    splitSegments.forEach(seg => {
      seg.selected = seg.is_missing || seg.file_type === "score";
    });
    renderSplitPdfSegments({ filename: splitPdfFile ? splitPdfFile.name : "", total_pages: 0 });
  };

  function updateConfirmUploadButtonText() {
    if (!maBtnConfirmUpload) return;
    if (pdfSplitMode) {
      const selected = splitSegments.filter(s => s.selected);
      maBtnConfirmUpload.innerHTML = `<i class="fa-solid fa-scissors"></i> Rozdělit a nahrát vybrané (${selected.length})`;
      maBtnConfirmUpload.disabled = selected.length === 0;
    } else {
      maBtnConfirmUpload.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Nahrát na Disk (${filesToUpload.length})`;
      maBtnConfirmUpload.disabled = filesToUpload.length === 0;
    }
  }

  maFolderInput?.addEventListener("change", (e) => {
    processSelectedFiles(Array.from(e.target.files));
    // Reset inputu aby šlo vybrat stejnou složku znovu
    maFolderInput.value = "";
  });

  maFileInput?.addEventListener("change", (e) => {
    processSelectedFiles(Array.from(e.target.files));
    // Reset inputu aby šlo vybrat stejné soubory znovu
    maFileInput.value = "";
  });

  function guessFileType(filename, alreadyMatched = new Set(), songTitle = "") {
    let defaultLower = filename.toLowerCase();

    // 1. Příprava "analýzovaného" názvu: odstraníme název písně a úvodní track-number / smetí
    let analyzedName = defaultLower
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (songTitle) {
      const normTitle = songTitle
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      // Odstraníme název písně, pokud se v souboru nachází
      if (analyzedName.includes(normTitle)) {
        analyzedName = analyzedName.replace(normTitle, "");
      }
    }

    // Odstraníme úvodní "smetí" jako " - 03 ", "04-", track numbers atp.
    analyzedName = analyzedName.replace(/^[\s\d\-_.]+/, "");

    const nameForRegex = analyzedName;
    const cleanName = normalizeName(analyzedName);
    const ext = filename.toLowerCase().split(".").pop();

    // Získáme všechna čísla ze souboru (z toho očištěného názvu) pro párování partů 1, 2, 3...
    const fileNumbers = (analyzedName.match(/\d+/g) || []).map((n) =>
      parseInt(n).toString(),
    );

    console.log(
      `Analyzing file: "${filename}" -> Cleaned: "${analyzedName}" | Numbers: [${fileNumbers.join(", ")}]`,
    );

    if (["mp3", "wav", "midi", "mid", "m4a"].includes(ext)) {
      return { type: "audio", instrumentName: null };
    }

    function safeIncludes(text, kw) {
      if (!text || !kw) return false;
      // Vždy používáme hranice slov pro instrumenty, abychom předešli "Trumpet" vs "Trumpety" v názvu písně.
      // Zároveň ale musíme povolit, aby hned za zkratkou bylo číslo (např. "trp1").
      const regex = new RegExp("(^|[^a-z0-9])" + kw + "($|[^a-z])", "i");
      return regex.test(text);
    }

    const scoreKeywords = [
      "partitura",
      "score",
      "vse",
      "full",
      "direkt",
      "dirigent",
      "conductor",
    ];
    if (scoreKeywords.some((kw) => safeIncludes(nameForRegex, kw))) {
      return { type: "score", instrumentName: null };
    }

    const instrumentFamilies = [
      { name: "Trumpet", keywords: ["trubka", "trumpet", "trp", "tp", "tpt"] },
      {
        name: "Trombone",
        keywords: [
          "pozoun",
          "trombone",
          "tbn",
          "trbn",
          "trb",
          "tuba",
          "poz",
          "trom",
          "pzn",
          "tb",
          "basstrombone",
          "basstrb",
          "trombon",
        ],
      },
      { name: "Alto Sax", keywords: ["alt", "alto", "asax", "as", "altosax"] },
      {
        name: "Tenor Sax",
        keywords: ["tenor", "tsax", "ts", "ten", "tenorsax"],
      },
      {
        name: "Baryton Sax",
        keywords: ["baryton", "bari", "baritone", "bsax", "bs", "barisax"],
      },
      { name: "Clarinet", keywords: ["klarinet", "clarinet", "cl", "kl"] },
      { name: "Flute", keywords: ["fletna", "flute", "fl", "flau"] },
      {
        name: "Bass",
        keywords: [
          "basa",
          "bass",
          "bg",
          "bgy",
          "baskytara",
          "bas_guit",
          "basguit",
          "string",
          "stringbass",
        ],
      },
      { name: "Guitar", keywords: ["kytara", "guitar", "gtr", "git", "kyt"] },
      {
        name: "Piano",
        keywords: [
          "klavir",
          "piano",
          "pno",
          "keys",
          "keyb",
          "pianino",
          "key",
          "keyboard",
          "keabord",
          "kbd",
          "kybd",
        ],
      },
      {
        name: "Drums",
        keywords: [
          "bici",
          "drums",
          "perc",
          "dr",
          "souprava",
          "percussion",
          "drum",
          "drumset",
          "set",
        ],
      },
      {
        name: "Main Vocals",
        keywords: [
          "mainvocal",
          "lead",
          "solo",
          "zpev",
          "vocals",
          "voc",
          "mainvoice",
          "voice",
          "vocal",
          "text",
          "lyrics",
          "sing",
        ],
      },
      {
        name: "Back Vocals",
        keywords: [
          "backvocal",
          "choir",
          "sbor",
          "vokaly",
          "vok",
          "coro",
          "bvox",
          "bgvox",
          "back",
        ],
      },
    ];

    // 0. Priorita: Staré/Archivní verze
    const isOld =
      cleanName.includes("stare") ||
      cleanName.includes("old") ||
      cleanName.includes("archiv");
    if (isOld) {
      return { type: "other", instrumentName: null };
    }

    // 1. Zjistíme rodinu nástroje
    for (const family of instrumentFamilies) {
      const match = family.keywords.some((kw) =>
        safeIncludes(nameForRegex, kw),
      );
      if (match) {
        // Vyfiltrujeme kandidáty ze seznamu nástrojů kapely, kteří ještě nebyli spárováni
        const candidates = instrumentsCache
          .filter((inst) => !alreadyMatched.has(inst.name))
          .filter((inst) => {
            const normInst = inst.name
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");
            return family.keywords.some((kw) => safeIncludes(normInst, kw));
          })
          .map((inst) => {
            const numMatch = inst.name.match(/\d+/);
            const instNumber = numMatch
              ? parseInt(numMatch[0]).toString()
              : null;
            return { inst, instNumber };
          });

        if (candidates.length === 0) continue;

        // Pokud má soubor v názvu konkrétní číslo (např. "Trubka 2" -> "2")
        if (fileNumbers.length > 0) {
          for (const num of fileNumbers) {
            const exactNumMatch = candidates.find((c) => c.instNumber === num);
            if (exactNumMatch) {
              return {
                type: "part",
                instrumentName: exactNumMatch.inst.name,
              };
            }
          }
        }

        // Pokud soubor číslo nemá nebo nebyla shoda čísla
        const exactUnnumbered = candidates.find((c) => c.instNumber === null);
        if (exactUnnumbered) {
          return { type: "part", instrumentName: exactUnnumbered.inst.name };
        } else {
          // Např. u pozounu: basstrombone má nejvyšší číslo
          const isBassTbn =
            family.name === "Trombone" &&
            (nameForRegex.includes("bass") ||
              nameForRegex.includes("basstrombone"));
          if (isBassTbn) {
            candidates.sort(
              (a, b) =>
                (parseInt(b.instNumber) || 0) - (parseInt(a.instNumber) || 0),
            );
          } else {
            candidates.sort(
              (a, b) =>
                (parseInt(a.instNumber) || 0) - (parseInt(b.instNumber) || 0),
            );
          }
          return { type: "part", instrumentName: candidates[0].inst.name };
        }
      }
    }

    // 2. BACKUP: Přímá shoda slov z názvu nástroje
    for (const inst of instrumentsCache) {
      if (alreadyMatched.has(inst.name)) continue;

      const normInstName = inst.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const instWords = normInstName
        .split(/[\s\-_.]+/)
        .filter((w) => w.length > 0);

      const numMatch = inst.name.match(/\d+/);
      const instNumber = numMatch ? parseInt(numMatch[0]).toString() : null;

      const allWordsMatch = instWords.every((word) => {
        if (word.match(/^\d+$/)) return fileNumbers.includes(word);
        return safeIncludes(nameForRegex, word);
      });

      if (allWordsMatch && instWords.length > 0) {
        return { type: "part", instrumentName: inst.name };
      }
    }

    return { type: "other", instrumentName: null };
  }

  function normalizeName(str) {
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Odstranění diakritiky
      .replace(/[^a-z0-9]/g, ""); // Ponechání jen alfanumerických znaků
  }

  function renderFilesToUpload() {
    if (!maFilesList) return;
    maFilesList.innerHTML = "";
    filesToUpload.forEach((item, index) => {
      const div = document.createElement("div");
      div.className = "glass-row";
      div.style = "justify-content: space-between;";

      const partsOptions = instrumentsCache
        .map(
          (inst) =>
            `<option value="part:${inst.name}" ${
              item.type === "part" && item.instrumentName === inst.name
                ? "selected"
                : ""
            }>Part: ${inst.name}</option>`,
        )
        .join("");

      div.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
          <i class="fa-solid fa-file" style="color: var(--accent); font-size: 1.1rem; flex-shrink: 0;"></i>
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9rem; font-weight: 600;" title="${item.file.name}">${item.file.name}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
          <select style="background: rgba(0,0,0,0.4); color: white; border: 1px solid var(--glass-border); border-radius: 6px; padding: 5px 8px; font-size: 0.85rem; cursor: pointer;" onchange="window.updateUploadAssignment(${index}, this.value)">
            <option value="score" ${item.type === "score" ? "selected" : ""}>Partitura</option>
            ${partsOptions}
            <option value="audio" ${item.type === "audio" ? "selected" : ""}>Audio</option>
            <option value="other" ${item.type === "other" ? "selected" : ""}>Jiné</option>
          </select>
          <button type="button" class="btn btn-secondary" onclick="window.removeFileUploadItem(${index})" title="Odebrat" style="padding: 5px 10px;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `;
      maFilesList.appendChild(div);
    });

    updateConfirmUploadButtonText();
  }

  window.updateUploadAssignment = function (index, value) {
    if (value.startsWith("part:")) {
      filesToUpload[index].type = "part";
      filesToUpload[index].instrumentName = value.split("part:")[1];
    } else {
      filesToUpload[index].type = value;
      filesToUpload[index].instrumentName = null;
    }
  };

  window.removeFileUploadItem = function (index) {
    filesToUpload.splice(index, 1);
    renderFilesToUpload();
  };

  maBtnConfirmUpload.onclick = async () => {
    if (pdfSplitMode) {
      const selected = splitSegments.filter(s => s.selected);
      if (selected.length === 0) {
        window.mirekAlert("Vyberte prosím alespoň jeden part k nahrání.");
        return;
      }

      maBtnConfirmUpload.disabled = true;
      const originalText = maBtnConfirmUpload.textContent;
      maBtnConfirmUpload.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Dělím a nahrávám (${selected.length} partů)...`;

      try {
        const formData = new FormData();
        formData.append("file", splitPdfFile);
        formData.append("rules_json", JSON.stringify(selected));

        const res = await fetch(`/ma/songs/${currentSongIdForUpload}/split_and_upload`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Chyba při dělení a nahrávání PDF.");
        }

        const resData = await res.json();
        window.mirekAlert(`Úspěšně rozděleno a nahráno ${resData.uploaded_count} partů na Google Disk!`);
        maUploadPanel.classList.add("hidden");
        renderMA();
        loadMADocLinks();
      } catch (e) {
        console.error(e);
        window.mirekAlert("Chyba při nahrávání: " + e.message);
      } finally {
        maBtnConfirmUpload.disabled = false;
        updateConfirmUploadButtonText();
      }
      return;
    }

    if (filesToUpload.length === 0) return;
    maBtnConfirmUpload.disabled = true;
    const originalText = maBtnConfirmUpload.textContent;

    try {
      let count = 0;
      for (const item of filesToUpload) {
        count++;
        maBtnConfirmUpload.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Nahrávám (${count}/${filesToUpload.length})...`;

        const formData = new FormData();
        formData.append("file", item.file);
        formData.append("file_type", item.type);
        if (item.instrumentName)
          formData.append("instrument_name", item.instrumentName);

        const res = await fetch(`/ma/songs/${currentSongIdForUpload}/files`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(
            errData.detail || "Chyba při nahrávání souboru " + item.file.name,
          );
        }
      }
      window.mirekAlert(
        "Všechny soubory byly nahrány a pojmenovány podle konvence.",
      );
      maUploadPanel.classList.add("hidden");
      renderMA();
      loadMADocLinks();
    } catch (e) {
      console.error(e);
      window.mirekAlert("Chyba při nahrávání: " + e.message);
    } finally {
      maBtnConfirmUpload.disabled = false;
      updateConfirmUploadButtonText();
    }
  };

  maBtnCancelUpload.onclick = maUploadModalClose.onclick = () => {
    maUploadPanel.classList.add("hidden");
  };

  if (maUploadPanel) {
    maUploadPanel.addEventListener("dragover", (e) => {
      e.preventDefault();
      maUploadPanel.style.border = "2px dashed var(--accent)";
    });
    maUploadPanel.addEventListener("dragleave", () => {
      maUploadPanel.style.border = "";
    });
    maUploadPanel.addEventListener("drop", async (e) => {
      e.preventDefault();
      maUploadPanel.style.border = "";
      if (e.dataTransfer && e.dataTransfer.items) {
        const files = await getAllFileEntries(e.dataTransfer.items);
        if (files.length > 0) {
          processSelectedFiles(files);
        }
      } else if (e.dataTransfer && e.dataTransfer.files) {
        processSelectedFiles(Array.from(e.dataTransfer.files));
      }
    });
  }

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
    const isStandardCatPM = (cat) =>
      cat === "Standard" || cat === "Standardní repertoár";
    const catDisplayNamePM = (cat) =>
      isStandardCatPM(cat) ? "Standardní repertoár" : cat;

    filtered.sort((a, b) => {
      // Standardní repertoár vždy první
      const aStd = isStandardCatPM(a.category);
      const bStd = isStandardCatPM(b.category);
      if (aStd && !bStd) return -1;
      if (!aStd && bStd) return 1;

      // Pokud jsou kategorie stejné, řadíme podle čísla
      if (a.category === b.category || (aStd && bStd)) {
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
        headLi.textContent = catDisplayNamePM(song.category);
        pmSourceList.appendChild(headLi);
      }

      const li = document.createElement("li");
      li.className = "pm-item song-item";
      li.dataset.songId = song.id;
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
      document.getElementById("pm-playlist-title").value || "PLAYLIST";
    const headerTitle = listTitle.toUpperCase();

    function limitText(str, limit) {
      if (!str) return "";
      if (str.length <= limit) return str;
      let truncated = str.substring(0, limit);
      const lastSpaceIndex = truncated.lastIndexOf(" ");
      if (lastSpaceIndex > 0) {
        truncated = truncated.substring(0, lastSpaceIndex);
      }
      return truncated + "…";
    }

    const blocks = document.querySelectorAll(".pm-block");
    const showBlockTitle = blocks.length > 1;

    // Sizing tiers from largest/spacious to compact
    const sizingTiers = [
      { baseFontSize: 20, headerFontSize: 28, blockTitleFontSize: 24, cellMargin: 5.0 },
      { baseFontSize: 19, headerFontSize: 27, blockTitleFontSize: 23, cellMargin: 4.5 },
      { baseFontSize: 18, headerFontSize: 26, blockTitleFontSize: 22, cellMargin: 4.0 },
      { baseFontSize: 17, headerFontSize: 25, blockTitleFontSize: 21, cellMargin: 3.5 },
      { baseFontSize: 16, headerFontSize: 24, blockTitleFontSize: 20, cellMargin: 3.0 },
      { baseFontSize: 15, headerFontSize: 22, blockTitleFontSize: 19, cellMargin: 2.5 },
      { baseFontSize: 14, headerFontSize: 20, blockTitleFontSize: 18, cellMargin: 2.0 },
      { baseFontSize: 13, headerFontSize: 19, blockTitleFontSize: 16, cellMargin: 1.5 },
      { baseFontSize: 12, headerFontSize: 18, blockTitleFontSize: 15, cellMargin: 1.0 },
    ];

    // A4 printable height with margins [35, 30, 35, 30] pt is 841.89 - 60 = ~780 pt
    const printableHeight = 770;

    // Helper to estimate total vertical height of the document for a given tier
    function calculateDocHeight(tier) {
      const headerHeight = tier.headerFontSize * 1.25 + tier.cellMargin * 5;
      let total = headerHeight;

      blocks.forEach((block) => {
        const targetList = block.querySelector(".target-list");
        const itemCount = targetList ? targetList.children.length : 0;
        if (itemCount === 0) return;

        if (showBlockTitle) {
          total += tier.blockTitleFontSize * 1.25 + tier.cellMargin * 5;
        }
        total += 15; // table top/bottom margin
        const itemHeight = tier.baseFontSize * 1.25 + tier.cellMargin * 2;
        total += itemCount * itemHeight;
      });

      return total;
    }

    // Determine optimal sizing tier:
    // 1. Prefer the largest tier that fits entirely on 1 single page (docHeight <= printableHeight).
    // 2. If it overflows to a 2nd page, ensure the 2nd page has at least 5 items (preventing orphan 1-4 lines).
    let selectedTier = sizingTiers[sizingTiers.length - 1];

    let singlePageTier = null;
    for (const tier of sizingTiers) {
      const h = calculateDocHeight(tier);
      if (h <= printableHeight) {
        singlePageTier = tier;
        break; // found largest tier that fits on 1 page
      }
    }

    if (singlePageTier) {
      selectedTier = singlePageTier;
    } else {
      // Look for a tier where the 2nd page has at least 5 items
      let multiPageTier = null;
      for (const tier of sizingTiers) {
        const h = calculateDocHeight(tier);
        const itemHeight = tier.baseFontSize * 1.25 + tier.cellMargin * 2;
        const overflowHeight = h - printableHeight;
        const itemsOnPage2 = Math.ceil(overflowHeight / itemHeight);

        if (itemsOnPage2 >= 5) {
          multiPageTier = tier;
          break;
        }
      }
      selectedTier = multiPageTier || sizingTiers[sizingTiers.length - 1];
    }

    const { baseFontSize, headerFontSize, blockTitleFontSize, cellMargin } = selectedTier;

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
              text: limitText(li.dataset.title.toUpperCase(), 23),
              bold: true,
              noWrap: true,
              margin: [0, cellMargin, 0, cellMargin],
            },
            {
              text: `(${li.dataset.num})`,
              bold: true,
              margin: [0, cellMargin, 0, cellMargin],
            },
            {
              text: limitText(li.dataset.singer.toUpperCase(), 12),
              bold: true,
              noWrap: true,
              margin: [0, cellMargin, 0, cellMargin],
            },
          ]);
          i++;
        }
      });

      blockStack.push({
        table: {
          widths: [30, 250, 45, 120],
          body: tableBody,
        },
        layout: "noBorders",
        margin: [20, 5, 20, 10],
      });

      // Make sure the block naturally drops down entirely to the next page if it does not fit
      // except if there is only 1 block in the playlist, so it doesn't jump out of sequence from title page
      content.push({
        stack: blockStack,
        unbreakable: blocks.length > 1,
      });
    });

    return {
      pageSize: "A4",
      pageMargins: [35, 30, 35, 30],
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

        // Extrakce ID skladeb v pořadí, jak jsou v playlistu
        const songIds = [];
        document
          .querySelectorAll("#pm-blocks-container .target-list li.song-item")
          .forEach((li) => {
            const id = li.dataset.songId;
            if (id) songIds.push(parseInt(id, 10));
          });
        formData.append("playlist_songs", JSON.stringify(songIds));
        try {
          const res = await fetch(`/events/${eventId}/playlist_attach`, {
            method: "POST",
            body: formData,
          });
          if (res.ok) {
            window.mirekAlert(
              "Playlist byl přímo připojen do Kalendáře k události!",
            );
          } else {
            const errData = await res.json().catch(() => ({}));
            window.mirekAlert(
              "Chyba při nahrávání do Kalendáře: " +
                (errData.detail || res.statusText || "Neznámá chyba"),
            );
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
          '<option value="" style="background: #181926; color: #fff;">Bez vazby na událost</option>';
        events.forEach((ev) => {
          const opt = document.createElement("option");
          opt.value = ev.id;
          opt.style.background = "#181926";
          opt.style.color = "#fff";
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

  // Pomocné funkce pro programové sestavení playlistu
  window.addSongToPlaylist = function (song, targetList) {
    if (!targetList) return;
    const li = document.createElement("li");
    li.className = "pm-item song-item";
    li.dataset.songId = song.id;
    li.dataset.duration = song.duration;
    li.dataset.num = song.number;
    li.dataset.title = song.title;
    li.dataset.singer = song.singer || "";
    li.addEventListener("dblclick", (e) => e.preventDefault());
    targetList.appendChild(li);
    window.updateBlockTime({ target: targetList });
  };

  window.addNoteToPlaylist = function (text, color, targetList) {
    if (!targetList) return;
    const li = document.createElement("li");
    li.className = "pm-item";
    li.dataset.duration = "0";
    li.dataset.isNote = "true";
    li.dataset.title = text;

    const isRed = color === "red";
    const pdfColor = isRed ? "#ef4444" : "inherit";
    const indicatorBg = isRed ? "#ef4444" : "transparent";
    const indicatorBorder = isRed ? "#ef4444" : "#cccccc";

    li.innerHTML = `
            <div class="pm-item-content" style="flex: 1;">
                <input type="text" class="pm-note-input" value="${text}" style="background: transparent; border: none; outline: none; color: ${pdfColor}; font-size: 1.2rem; font-weight: bold; font-family: 'CalibriPdf', sans-serif; width: 100%;" onfocus="this.select();">
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <button class="btn-color-toggle" style="background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0;" data-color="${isRed ? 'red' : 'white'}" title="Přepnout barvu na červenou">
                    <div style="width: 12px; height: 12px; border-radius: 50%; border: 2px solid ${indicatorBorder}; background: ${indicatorBg}; transition: all 0.2s;" class="color-indicator"></div>
                </button>
                <button class="btn-remove-item" onclick="this.closest('li').remove(); window.updateBlockTime({target: this.closest('.target-list')});" title="Odebrat">✖</button>
            </div>
        `;

    const noteInput = li.querySelector(".pm-note-input");
    const colorToggle = li.querySelector(".btn-color-toggle");
    const indicator = colorToggle.querySelector(".color-indicator");

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
    window.updateBlockTime({ target: targetList });
  };

  window.loadPlaylistStructure = function (data) {
    const pmTitle = document.getElementById("pm-playlist-title");
    if (pmTitle && data.title) {
      pmTitle.value = data.title;
    }

    const pmBlocksContainer = document.getElementById("pm-blocks-container");
    if (!pmBlocksContainer) return;
    pmBlocksContainer.innerHTML = "";
    blockCount = 0;

    data.blocks.forEach((blockData) => {
      blockCount++;
      const blockHTML = document.createElement("div");
      blockHTML.className = "pm-block" + (blockCount === 1 ? " active" : "");
      blockHTML.dataset.blockId = blockCount;
      blockHTML.innerHTML = `
            <div class="pm-block-header">
                <input type="text" class="pm-block-title" value="${blockData.title || (blockCount + '. Blok')}">
                <div class="pm-block-ui-actions">
                    <div class="pm-block-stats">Čas: <span class="pm-time">00:00</span> | Skladby: <span class="pm-count">0</span></div>
                    <button class="btn btn-secondary btn-clear-block" onclick="window.clearBlock(this)">Vymazat vše</button>
                    <button class="btn btn-secondary btn-remove-block" onclick="window.removeBlock(this)">Odstranit blok</button>
                </div>
            </div>
            <ul class="pm-list target-list" data-block-id="${blockCount}"></ul>
        `;
      pmBlocksContainer.appendChild(blockHTML);
      const targetList = blockHTML.querySelector(".target-list");
      initBlockSortable(targetList);

      blockData.items.forEach((item) => {
        if (item.type === "song") {
          window.addSongToPlaylist(item, targetList);
        } else if (item.type === "note") {
          window.addNoteToPlaylist(item.text, item.color || "white", targetList);
        } else if (item.type === "song_not_found") {
          window.addNoteToPlaylist(`[NENALEZENO] ${item.title} (${item.number})`, "red", targetList);
        }
      });
    });

    updateBlockHeadersVisibility();
    updateWYSIWYGScaling();
  };

  // Import PDF Logika
  const pmBtnImportPdf = document.getElementById("pm-btn-import-pdf");
  const pmPdfImportInput = document.getElementById("pm-pdf-import-input");
  if (pmBtnImportPdf && pmPdfImportInput) {
    pmBtnImportPdf.addEventListener("click", () => pmPdfImportInput.click());
    pmPdfImportInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const btnText = pmBtnImportPdf.innerHTML;
      pmBtnImportPdf.disabled = true;
      pmBtnImportPdf.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Parsování...';

      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/ma/playlist/parse_pdf", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          window.loadPlaylistStructure(data);
          window.mirekAlert("Playlist byl úspěšně načten z PDF!");
        } else {
          const errData = await res.json().catch(() => ({}));
          window.mirekAlert("Chyba při parsování: " + (errData.detail || "Neznámá chyba"));
        }
      } catch (err) {
        console.error(err);
        window.mirekAlert("Kritická chyba spojení při parsování PDF.");
      } finally {
        pmBtnImportPdf.disabled = false;
        pmBtnImportPdf.innerHTML = btnText;
        pmPdfImportInput.value = "";
      }
    });
  }

  // Upravit přiložený Logika
  const pmBtnLoadAttached = document.getElementById("pm-btn-load-attached");
  if (pmBtnLoadAttached) {
    pmBtnLoadAttached.addEventListener("click", async () => {
      const eventId = pmEventSelect.value;
      if (!eventId) return;

      const btnText = pmBtnLoadAttached.innerHTML;
      pmBtnLoadAttached.disabled = true;
      pmBtnLoadAttached.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Načítám...';

      try {
        const res = await fetch(`/events/${eventId}/playlist/parse`);
        if (res.ok) {
          const data = await res.json();
          window.loadPlaylistStructure(data);
          window.mirekAlert("Přiložený playlist byl úspěšně načten a můžete jej editovat!");
        } else {
          const errData = await res.json().catch(() => ({}));
          window.mirekAlert("Chyba při načítání: " + (errData.detail || "Playlist nebyl nalezen."));
        }
      } catch (err) {
        console.error(err);
        window.mirekAlert("Kritická chyba při stahování playlistu z kalendáře.");
      } finally {
        pmBtnLoadAttached.disabled = false;
        pmBtnLoadAttached.innerHTML = btnText;
      }
    });
  }

  // Registrace listeneru pro pm-event-select (pouze jednou)
  const pmEventSelect = document.getElementById("pm-event-select");
  if (pmEventSelect) {
    pmEventSelect.addEventListener("change", (e) => {
      const pmTitle = document.getElementById("pm-playlist-title");
      const pmExportCalBtn = document.getElementById("pm-export-cal");
      const loadAttachedBtn = document.getElementById("pm-btn-load-attached");

      if (pmEventSelect.selectedIndex > 0) {
        const txt =
          pmEventSelect.options[pmEventSelect.selectedIndex].textContent;
        if (pmTitle) pmTitle.value = txt; // Keeps Date + Title
        if (pmExportCalBtn) {
          pmExportCalBtn.disabled = false;
          pmExportCalBtn.title = "";
        }
        if (loadAttachedBtn) {
          loadAttachedBtn.style.display = "inline-block";
        }
      } else {
        if (pmTitle) pmTitle.value = "";
        if (pmExportCalBtn) {
          pmExportCalBtn.disabled = true;
          pmExportCalBtn.title = "Vyberte událost nahoře";
        }
        if (loadAttachedBtn) {
          loadAttachedBtn.style.display = "none";
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
