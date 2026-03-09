// v2 – Ambient Weather temp/wind fetch button, fix btnSave wiring
window.__appLoaded = true;

const els = {
  projectLabel: document.getElementById("projectLabel"),
  btnSetProject: document.getElementById("btnSetProject"),
  btnExportCsv: document.getElementById("btnExportCsv"),

  date: document.getElementById("date"),
  foam: document.getElementById("foam"),
  fuel: document.getElementById("fuel"),
  testType: document.getElementById("testType"),
  airTemp: document.getElementById("airTemp"),
  wind: document.getElementById("wind"),
  fuelTemp: document.getElementById("fuelTemp"),
  solutionTemp: document.getElementById("solutionTemp"),
  controlTime: document.getElementById("controlTime"),
  extinguishmentTime: document.getElementById("extinguishmentTime"),

  btnFetchTemp: document.getElementById("btnFetchTemp"),
  btnSave: document.getElementById("btnSave"),
  btnEdit: document.getElementById("btnEdit"),
  btnDeleteTop: document.getElementById("btnDeleteTop"),
  btnClear: document.getElementById("btnClear"),

  tbody: document.getElementById("tbody"),
  pagination: document.getElementById("pagination"),
  status: document.getElementById("status"),
  statusBar: document.getElementById("statusBar"),

  syncDialog: document.getElementById("syncDialog"),
  syncNameInput: document.getElementById("syncNameInput"),
};

const PAGE_SIZE = 25;
let currentPage = 1;

let project = localStorage.getItem("kv_project_name") || "";
let entries = [];
let selectedId = null;
let pendingAction = null; // 'save' | 'export' | 'refresh'

function setStatus(msg, isError=false) {
  els.status.textContent = msg;
  els.statusBar.dataset.error = isError ? "1" : "0";
}

function sanitizeProjectName(s) {
  if (!s) return "";
  return String(s).trim().replace(/\s+/g, " ").slice(0, 80).replace(/[^\w .\-]/g, "");
}

function renderProject() {
  els.projectLabel.textContent = project || "Not set";
}

function openSyncDialog() {
  els.syncNameInput.value = project || "";
  els.syncDialog.showModal();
  els.syncNameInput.focus();
}

function ensureProject(promptIfMissing=true, action=null) {
  if (project) return true;
  if (!promptIfMissing) return false;
  pendingAction = action || pendingAction || "refresh";
  openSyncDialog();
  setStatus("Set Sync Name to save/sync.", true);
  return false;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...opts,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error || data?.message || (typeof data?.raw === "string" ? data.raw.slice(0, 200) : "Request failed");
    throw new Error(`${msg} (HTTP ${res.status})`);
  }
  return data;
}

function selectRow(id) {
  selectedId = id;
  els.btnEdit.disabled = !selectedId;
  els.btnDeleteTop.disabled = !selectedId;
  [...els.tbody.querySelectorAll("tr")].forEach(tr => tr.classList.toggle("selected", tr.dataset.id === selectedId));
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function nowMilitary() {
  const d = new Date();
  return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
}

function setTodayIfEmpty() {
  if (!els.date.value) els.date.value = todayISO();
}

function digitsToTimeDigitsOnly(digits) {
  const s = String(digits).replace(/\D/g, "");
  if (!s) return "";
  if (s.length === 1) return `0:0${s}`;
  if (s.length === 2) return `0:${s}`;
  if (s.length === 3) return `${Number(s.slice(0,1))}:${s.slice(1)}`;
  const mm = Number(s.slice(0,2));
  const ss = s.slice(2,4);
  return `${mm}:${ss}`;
}

function normalizeTime(val) {
  const raw = String(val ?? "").trim();
  if (!raw) return "";
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const m = raw.match(/^(\d{1,2}):(\d{2})$/);
    const sec = Number(m[2]);
    if (sec > 59) return "";
    return `${Number(m[1])}:${m[2]}`;
  }
  const t = digitsToTimeDigitsOnly(raw);
  if (!t) return "";
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  const sec = Number(m[2]);
  if (sec > 59) return "";
  return `${Number(m[1])}:${m[2]}`;
}

function attachTimeAssist(inputEl) {
  inputEl.addEventListener("input", () => {
    inputEl.value = inputEl.value.replace(/[^\d:]/g, "").slice(0, 5);
  });
  inputEl.addEventListener("blur", () => {
    const n = normalizeTime(inputEl.value);
    if (inputEl.value && !n) return setStatus("Time must be mm:ss (e.g., 0:33) or digits (e.g., 122).", true);
    if (n) inputEl.value = n;
  });
}
attachTimeAssist(els.controlTime);
attachTimeAssist(els.extinguishmentTime);

function getFormData(includeTime = false) {
  const d = {
    date: els.date.value || "",
    foam: els.foam.value || "",
    fuel: els.fuel.value || "",
    testType: els.testType.value || "",
    airTemp: els.airTemp.value || "",
    wind: els.wind.value || "",
    fuelTemp: els.fuelTemp.value || "",
    solutionTemp: els.solutionTemp.value || "",
    controlTime: normalizeTime(els.controlTime.value || ""),
    extinguishmentTime: normalizeTime(els.extinguishmentTime.value || ""),
  };
  if (includeTime) d.savedTime = nowMilitary();
  return d;
}

function setFormData(d) {
  els.date.value = d?.date || "";
  els.foam.value = d?.foam || "";
  els.fuel.value = d?.fuel || "";
  els.testType.value = d?.testType || "";
  els.airTemp.value = d?.airTemp || "";
  els.wind.value = d?.wind || "";
  els.fuelTemp.value = d?.fuelTemp || "";
  els.solutionTemp.value = d?.solutionTemp || "";
  els.controlTime.value = d?.controlTime || "";
  els.extinguishmentTime.value = d?.extinguishmentTime || "";
}

function clearForm() {
  setFormData({});
  els.testType.value = "";
  setTodayIfEmpty();
  selectRow(null);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderPagination() {
  const total = entries.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const pag = els.pagination;
  if (!pag) return;
  pag.innerHTML = "";
  if (totalPages <= 1) return;

  const info = document.createElement("span");
  info.className = "pagInfo";
  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, total);
  info.textContent = `${start}–${end} of ${total}`;

  const prev = document.createElement("button");
  prev.className = "btn ghost pagBtn";
  prev.type = "button";
  prev.textContent = "← Prev";
  prev.disabled = currentPage === 1;
  prev.addEventListener("click", () => { currentPage--; renderTable(); });

  const next = document.createElement("button");
  next.className = "btn ghost pagBtn";
  next.type = "button";
  next.textContent = "Next →";
  next.disabled = currentPage === totalPages;
  next.addEventListener("click", () => { currentPage++; renderTable(); });

  pag.appendChild(prev);
  pag.appendChild(info);
  pag.appendChild(next);
}

function renderTable() {
  const total = entries.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageEntries = entries.slice(start, start + PAGE_SIZE);

  els.tbody.innerHTML = "";
  for (const e of pageEntries) {
    const tr = document.createElement("tr");
    tr.dataset.id = e.id;
    tr.innerHTML = `
      <td>${escapeHtml(e.date)}</td>
      <td>${escapeHtml(e.savedTime || "")}</td>
      <td>${escapeHtml(e.foam)}</td>
      <td>${escapeHtml(e.fuel)}</td>
      <td>${escapeHtml(e.testType)}</td>
      <td>${escapeHtml(e.airTemp)}</td>
      <td>${escapeHtml(e.wind)}</td>
      <td>${escapeHtml(e.fuelTemp)}</td>
      <td>${escapeHtml(e.solutionTemp)}</td>
      <td>${escapeHtml(e.controlTime)}</td>
      <td>${escapeHtml(e.extinguishmentTime)}</td>
      <td>
        <div class="rowActions">
          <button class="btn ghost" data-act="edit" type="button">Edit</button>
          <button class="btn danger ghost" data-act="delete" type="button">Del</button>
        </div>
      </td>
    `;

    tr.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button");
      if (btn) return;
      selectRow(e.id);
    });

    tr.querySelector('[data-act="edit"]').addEventListener("click", () => {
      setFormData(e);
      selectRow(e.id);
      setStatus("Loaded row for editing.");
    });

    tr.querySelector('[data-act="delete"]').addEventListener("click", async () => {
      await deleteEntry(e.id);
    });

    els.tbody.appendChild(tr);
  }
  selectRow(selectedId);
  renderPagination();
}

async function refresh() {
  if (!ensureProject(false, "refresh")) {
    entries = [];
    renderTable();
    return;
  }
  try {
    const data = await api(`/api/entries?project=${encodeURIComponent(project)}`);
    entries = Array.isArray(data.entries) ? data.entries : [];
    renderTable();
  } catch (e) {
    setStatus(e.message, true);
    throw e;
  }
}

async function saveNewEntry() {
  if (!ensureProject(true, "save")) return;

  const entry = getFormData(true); // capture time
  if (!entry.testType) return setStatus("Select Test Type.", true);

  if (els.controlTime.value) els.controlTime.value = entry.controlTime || els.controlTime.value;
  if (els.extinguishmentTime.value) els.extinguishmentTime.value = entry.extinguishmentTime || els.extinguishmentTime.value;

  try {
    setStatus("Saving…");
    await api(`/api/entries?project=${encodeURIComponent(project)}`, {
      method: "POST",
      body: JSON.stringify({ entry }),
    });
    await refresh();
    clearForm();
    setStatus("Saved.");
  } catch (e) {
    setStatus(e.message, true);
  }
}

async function updateEntry() {
  if (!ensureProject(true, "save")) return;
  if (!selectedId) return;

  const entry = getFormData(false); // don't overwrite time on edit
  if (!entry.testType) return setStatus("Select Test Type.", true);

  // preserve original savedTime if present
  const orig = entries.find(x => x.id === selectedId);
  if (orig?.savedTime) entry.savedTime = orig.savedTime;

  try {
    setStatus("Updating…");
    await api(`/api/entries?project=${encodeURIComponent(project)}&id=${encodeURIComponent(selectedId)}`, {
      method: "PUT",
      body: JSON.stringify({ entry }),
    });
    await refresh();
    clearForm();
    setStatus("Updated.");
  } catch (e) {
    setStatus(e.message, true);
  }
}

async function deleteEntry(id) {
  if (!ensureProject(true, "save")) return;

  const entry = entries.find(x => x.id === id);
  const label = entry ? `${entry.date || "No date"} / ${entry.foam || "Foam"} / ${entry.fuel || "Fuel"}` : id;

  const ok = confirm(`Delete this row?\n${label}`);
  if (!ok) return;

  try {
    setStatus("Deleting…");
    await api(`/api/entries?project=${encodeURIComponent(project)}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (selectedId === id) selectedId = null;
    await refresh();
    clearForm();
    setStatus("Deleted.");
  } catch (e) {
    setStatus(e.message, true);
  }
}

function csvCell(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function entriesToCsv(rows) {
  const headers = ["Date","Time","Foam","Fuel","Test Type","Air Temp","Wind","Fuel Temp","Solution Temp","Control","Extinguishment"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    const vals = [r.date,r.savedTime||"",r.foam,r.fuel,r.testType,r.airTemp,r.wind,r.fuelTemp,r.solutionTemp,r.controlTime,r.extinguishmentTime].map(csvCell);
    lines.push(vals.join(","));
  }
  return lines.join("\n");
}

async function exportCsv() {
  if (!ensureProject(true, "export")) return;
  try {
    setStatus("Exporting…");
    const data = await api(`/api/entries/export?project=${encodeURIComponent(project)}`, { method: "GET" });
    const rows = Array.isArray(data.entries) ? data.entries : [];
    const csv = entriesToCsv(rows);

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `entries-${project.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("Exported CSV.");
  } catch (e) {
    console.error(e);
    setStatus(e.message, true);
  }
}

// Ambient Weather – fetch avg air temp over past 10 minutes
const AW_API_KEY = "dc0e8073e5c54e27bb919e6d37435e3e0cab0f73e98d41bd815b879bf551d5ff";
const AW_APP_KEY = "0b623f64f3954e4db7f3cb9a5d5ce4f1bac3e8652d2347f5bc2caac1cbf61938";
const AW_MAC = "24:D7:EB:EB:99:5F";

async function fetchAmbientTemp() {
  els.btnFetchTemp.disabled = true;
  setStatus("Fetching weather station data…");
  try {
    // Request last 12 readings (each ~5 min apart) to cover at least 10 min
    const url = `https://rt.ambientweather.net/v1/devices/${encodeURIComponent(AW_MAC)}` +
      `?apiKey=${AW_API_KEY}&applicationKey=${AW_APP_KEY}&limit=12`;
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Ambient Weather API error ${res.status}: ${txt.slice(0, 120)}`);
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error("No data returned from station.");

    // Filter to readings within the last 10 minutes
    const cutoff = Date.now() - 10 * 60 * 1000;
    const recent = data.filter(d => {
      const ts = d.dateutc ?? d.date;
      return ts && new Date(ts).getTime() >= cutoff;
    });

    const pool = recent.length > 0 ? recent : [data[0]]; // fallback to most recent
    const temps = pool.map(d => d.tempf).filter(t => typeof t === "number");
    if (temps.length === 0) throw new Error("No temperature readings found.");

    const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
    els.airTemp.value = avg.toFixed(1);

    const winds = pool.map(d => d.windspeedmph).filter(w => typeof w === "number");
    if (winds.length > 0) {
      const maxWind = Math.max(...winds);
      els.wind.value = maxWind.toFixed(1);
    }

    const label = recent.length > 0
      ? `Air temp & wind set (avg temp, max wind over last 10 min).`
      : `Air temp & wind set (most recent reading — no data in last 10 min).`;
    setStatus(label);
  } catch (e) {
    console.error(e);
    setStatus(`Weather fetch failed: ${e.message}`, true);
  } finally {
    els.btnFetchTemp.disabled = false;
  }
}

els.btnFetchTemp.addEventListener("click", fetchAmbientTemp);

// Button wiring
els.btnSave.addEventListener("click", saveNewEntry);
els.btnEdit.addEventListener("click", updateEntry);
els.btnDeleteTop.addEventListener("click", async () => selectedId && deleteEntry(selectedId));
els.btnClear.addEventListener("click", () => { clearForm(); setStatus("Cleared."); });
els.btnExportCsv.addEventListener("click", exportCsv);
els.btnSetProject.addEventListener("click", openSyncDialog);

// Sync dialog behavior
els.syncDialog.addEventListener("close", async () => {
  if (els.syncDialog.returnValue !== "ok") { pendingAction = null; return; }
  const p = sanitizeProjectName(els.syncNameInput.value || "");
  if (!p) { pendingAction = null; return setStatus("Sync Name is required.", true); }

  project = p;
  localStorage.setItem("kv_project_name", project);
  renderProject();

  const action = pendingAction;
  pendingAction = null;

  if (action === "save") { await saveNewEntry(); return; }
  if (action === "export") { await refresh(); await exportCsv(); return; }

  clearForm();
  await refresh();
  setStatus("Sync Name set.");
});

// Startup
window.addEventListener("error", (e) => { console.error(e.error || e); setStatus(`JS error: ${e.message || "unknown"}`, true); });
window.addEventListener("unhandledrejection", (e) => { console.error(e.reason || e); setStatus(`Promise error: ${String(e.reason || "unknown")}`, true); });

(async () => {
  setStatus("Starting…");
  renderProject();
  setTodayIfEmpty();

  // API health check
  let apiOk = true;
  try { await api("/api/ping", { method: "GET" }); }
  catch (e) { console.error(e); apiOk = false; setStatus(`API not reachable: ${e.message}`, true); }

  if (apiOk) {
    try {
      await refresh();
      if (els.statusBar.dataset.error !== "1") setStatus("Ready.");
    } catch (e) {
      // error already shown by refresh()
    }
  }
})();
