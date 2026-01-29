(() => {
  // ---------- CONFIG ----------
  const STORAGE_KEY = "study_calendar_events_v1";

  // Your images are in the repo ROOT (not /assets)
  const HERO_IMAGES = ["hero1.jpg", "hero2.jpg", "hero3.jpg", "hero4.jpg"];

  const MONTHS_SL = [
    "januar","februar","marec","april","maj","junij",
    "julij","avgust","september","oktober","november","december"
  ];
  const DOW_SL = ["nedelja","ponedeljek","torek","sreda","četrtek","petek","sobota"];

  // ---------- HELPERS ----------
  const pad2 = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const mondayIndex = (date) => (date.getDay() + 6) % 7; // Pon=0..Ned=6

  const isoToDate = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const formatDateLongSL = (iso) => {
    if (!iso) return "—";
    const dt = isoToDate(iso);
    const d = dt.getDate();
    const m = dt.getMonth();
    const y = dt.getFullYear();
    return `${d}. ${MONTHS_SL[m]} ${y}`;
  };

  const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const escapeHtml = (str) =>
    String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const cryptoId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  // ---------- STATE ----------
  let events = loadEvents();
  let view = new Date();
  view.setDate(1);
  let selectedISO = ymd(new Date());

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);

  const screenWelcome = $("#screen-welcome");
  const screenCalendar = $("#screen-calendar");

  const heroImage = $("#heroImage");
  const btnGoCalendar = $("#btnGoCalendar");

  const btnBack = $("#btnBack");
  const btnPrev = $("#btnPrev");
  const btnNext = $("#btnNext");
  const monthLabel = $("#monthLabel");
  const todayLabel = $("#todayLabel");

  const grid = $("#grid");

  const selectedDateTitle = $("#selectedDateTitle");
  const selectedDateSub = $("#selectedDateSub");
  const eventsList = $("#eventsList");

  const btnAddTop = $("#btnAddTop");
  const btnAddSide = $("#btnAddSide");

  const upcomingList = $("#upcomingList");

  // Backup
  const btnExport = $("#btnExport");
  const fileImport = $("#fileImport");

  // Modal + form
  const modal = $("#modal");
  const eventForm = $("#eventForm");
  const fDate = $("#fDate");
  const fTitle = $("#fTitle");
  const fType = $("#fType");
  const fColor = $("#fColor");
  const fIcon = $("#fIcon");
  const fNote = $("#fNote");

  // ---------- INIT ----------
  setRandomHeroImage();
  updateTodayLabel();
  renderAll();

  // ---------- ROUTING ----------
  btnGoCalendar.addEventListener("click", () => showCalendar());
  btnBack.addEventListener("click", () => showWelcome());

  // ---------- NAV ----------
  btnPrev.addEventListener("click", () => {
    view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
    renderAll();
  });

  btnNext.addEventListener("click", () => {
    view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    renderAll();
  });

  // ---------- ADD ----------
  const openAddModalFor = (iso) => {
    fDate.value = iso || selectedISO || ymd(new Date());
    fTitle.value = "";
    fType.value = "Izpit";
    fColor.value = "#5b8cff";
    fIcon.value = "📝";
    fNote.value = "";
    openModal();
    setTimeout(() => fTitle.focus(), 0);
  };

  btnAddTop.addEventListener("click", () => openAddModalFor(selectedISO));
  btnAddSide.addEventListener("click", () => openAddModalFor(selectedISO));

  // Close modal
  modal.addEventListener("click", (e) => {
    if (e.target?.dataset?.close) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("modal--open")) closeModal();
  });

  // Save event
  eventForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const iso = fDate.value;
    const title = fTitle.value.trim();
    if (!iso || !title) return;

    const item = {
      id: cryptoId(),
      date: iso,
      title,
      type: fType.value,
      color: fColor.value,
      icon: fIcon.value,
      note: fNote.value.trim(),
      createdAt: Date.now()
    };

    events.push(item);
    saveEvents();
    closeModal();

    selectedISO = iso;
    const dt = isoToDate(iso);
    view = new Date(dt.getFullYear(), dt.getMonth(), 1);

    renderAll();
  });

  // ---------- BACKUP (EXPORT/IMPORT) ----------
  btnExport?.addEventListener("click", () => {
    const payload = { exportedAt: new Date().toISOString(), events };
    downloadJson(`studijski-koledar-backup-${new Date().toISOString().slice(0,10)}.json`, payload);
  });

  fileImport?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const importedEvents = Array.isArray(parsed) ? parsed : parsed?.events;
      if (!Array.isArray(importedEvents)) throw new Error("Bad format");

      mergeImportedEvents(importedEvents);
      renderAll();
    } catch {
      alert("Uvoz ni uspel. Preveri, da je datoteka veljaven JSON backup.");
    } finally {
      e.target.value = "";
    }
  });

  function downloadJson(filename, dataObj) {
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function mergeImportedEvents(imported) {
    const existingIds = new Set(events.map(e => e.id));
    const cleaned = imported
      .filter(x => x && typeof x === "object" && x.date && x.title)
      .map(x => ({
        id: x.id && typeof x.id === "string" ? x.id : cryptoId(),
        date: String(x.date),
        title: String(x.title),
        type: x.type ? String(x.type) : "Drugo",
        color: x.color ? String(x.color) : "#5b8cff",
        icon: x.icon ? String(x.icon) : "📝",
        note: x.note ? String(x.note) : "",
        createdAt: typeof x.createdAt === "number" ? x.createdAt : Date.now()
      }));

    for (const ev of cleaned) {
      if (!existingIds.has(ev.id)) {
        events.push(ev);
        existingIds.add(ev.id);
      }
    }
    saveEvents();
  }

  // ---------- RENDER ----------
  function renderAll() {
    renderMonthLabel();
    renderGrid();
    renderSidePanel();
    renderUpcoming();
  }

  function renderMonthLabel() {
    const m = view.getMonth();
    const y = view.getFullYear();
    monthLabel.textContent = `${capitalize(MONTHS_SL[m])} ${y}`;
  }

  function renderGrid() {
    grid.innerHTML = "";

    const year = view.getFullYear();
    const month = view.getMonth();

    const firstDay = new Date(year, month, 1);
    const startOffset = mondayIndex(firstDay);
    const totalCells = 42;

    const gridStart = new Date(year, month, 1 - startOffset);

    const todayISO = ymd(new Date());

    for (let i = 0; i < totalCells; i++) {
      const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const iso = ymd(d);

      const inThisMonth = d.getMonth() === month;
      const dayEvents = eventsForDate(iso);

      const cell = document.createElement("div");
      cell.className =
        "day" +
        (!inThisMonth ? " day--muted" : "") +
        (iso === todayISO ? " day--today" : "") +
        (iso === selectedISO ? " day--selected" : "");
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("tabindex", "0");
      cell.setAttribute("aria-label", `${formatDateLongSL(iso)}. Dogodkov: ${dayEvents.length}`);

      const num = document.createElement("div");
      num.className = "day__num";
      num.textContent = d.getDate();
      cell.appendChild(num);

      const dots = document.createElement("div");
      dots.className = "day__dots";

      dayEvents.slice(0, 4).forEach(ev => {
        const dot = document.createElement("div");
        dot.className = "dot";
        dot.textContent = ev.icon || "•";
        dot.style.background = ev.color || "rgba(91,140,255,.35)";
        dots.appendChild(dot);
      });

      cell.appendChild(dots);

      const onSelect = () => {
        selectedISO = iso;
        renderAll();
      };

      cell.addEventListener("click", onSelect);
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      });

      grid.appendChild(cell);
    }
  }

  function renderSidePanel() {
    if (!selectedISO) {
      selectedDateTitle.textContent = "Izberi dan";
      selectedDateSub.textContent = "—";
      eventsList.innerHTML = `<div class="empty muted">Izberi dan v koledarju.</div>`;
      return;
    }

    const dt = isoToDate(selectedISO);
    selectedDateTitle.textContent = formatDateLongSL(selectedISO);
    selectedDateSub.textContent = capitalize(DOW_SL[dt.getDay()]);

    const list = eventsForDate(selectedISO).sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
    eventsList.innerHTML = "";

    if (list.length === 0) {
      eventsList.innerHTML = `<div class="empty muted">Ni dogodkov.</div>`;
      return;
    }

    list.forEach(ev => {
      const row = document.createElement("div");
      row.className = "event";

      const badge = document.createElement("div");
      badge.className = "event__badge";
      badge.textContent = ev.icon || "📝";
      badge.style.background = ev.color || "rgba(91,140,255,.25)";
      row.appendChild(badge);

      const main = document.createElement("div");
      main.className = "event__main";

      const title = document.createElement("div");
      title.className = "event__title";
      title.textContent = ev.title;
      main.appendChild(title);

      const meta = document.createElement("div");
      meta.className = "event__meta";
      meta.innerHTML = `<span>${escapeHtml(ev.type || "Drugo")}</span><span>•</span><span>${escapeHtml(ev.date)}</span>`;
      main.appendChild(meta);

      if (ev.note) {
        const note = document.createElement("div");
        note.className = "event__note";
        note.textContent = ev.note;
        main.appendChild(note);
      }

      row.appendChild(main);

      const actions = document.createElement("div");
      actions.className = "event__actions";

      const del = document.createElement("button");
      del.className = "iconbtn";
      del.type = "button";
      del.textContent = "🗑️";
      del.title = "Izbriši";
      del.addEventListener("click", () => removeEvent(ev.id));

      actions.appendChild(del);
      row.appendChild(actions);

      eventsList.appendChild(row);
    });
  }

  function renderUpcoming() {
    if (!upcomingList) return;

    const today = new Date();
    today.setHours(0,0,0,0);
    const todayISO = ymd(today);

    const future = events
      .filter(e => e.date >= todayISO)
      .sort((a,b) => a.date.localeCompare(b.date) || (a.createdAt||0) - (b.createdAt||0))
      .slice(0, 10);

    upcomingList.innerHTML = "";

    if (future.length === 0) {
      upcomingList.innerHTML = `<div class="empty muted">Ni prihodnjih dogodkov.</div>`;
      return;
    }

    for (const ev of future) {
      const item = document.createElement("div");
      item.className = "upitem";

      const badge = document.createElement("div");
      badge.className = "upitem__badge";
      badge.textContent = ev.icon || "📝";
      badge.style.background = ev.color || "rgba(91,140,255,.25)";
      item.appendChild(badge);

      const main = document.createElement("div");
      main.className = "upitem__main";

      const title = document.createElement("div");
      title.className = "upitem__title";
      title.textContent = ev.title;
      main.appendChild(title);

      const meta = document.createElement("div");
      meta.className = "upitem__meta";
      meta.innerHTML = `<span>${escapeHtml(ev.type || "Drugo")}</span><span>•</span><span>${escapeHtml(formatDateLongSL(ev.date))}</span>`;
      main.appendChild(meta);

      item.appendChild(main);

      item.addEventListener("click", () => {
        selectedISO = ev.date;
        const dt = isoToDate(ev.date);
        view = new Date(dt.getFullYear(), dt.getMonth(), 1);
        renderAll();
      });

      upcomingList.appendChild(item);
    }
  }

  // ---------- STORAGE ----------
  function loadEvents() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(x => x && typeof x === "object" && x.id && x.date && x.title);
    } catch {
      return [];
    }
  }

  function saveEvents() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }

  function eventsForDate(iso) {
    return events.filter(e => e.date === iso);
  }

  function removeEvent(id) {
    events = events.filter(e => e.id !== id);
    saveEvents();
    renderAll();
  }

  // ---------- UI ----------
  function showWelcome() {
    screenWelcome.classList.add("screen--active");
    screenCalendar.classList.remove("screen--active");
  }

  function showCalendar() {
    screenWelcome.classList.remove("screen--active");
    screenCalendar.classList.add("screen--active");

    const dt = isoToDate(selectedISO);
    view = new Date(dt.getFullYear(), dt.getMonth(), 1);

    renderAll();
  }

  function openModal() {
    modal.classList.add("modal--open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    modal.classList.remove("modal--open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function setRandomHeroImage() {
    const src = HERO_IMAGES[Math.floor(Math.random() * HERO_IMAGES.length)];
    heroImage.src = src;
  }

  function updateTodayLabel() {
    const now = new Date();
    todayLabel.textContent = `Danes: ${formatDateLongSL(ymd(now))}`;
  }
})();
