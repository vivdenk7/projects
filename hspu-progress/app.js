const STORAGE_KEY = "hspu-progress-v1";

const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.id, s]));

const ROW_Y = { 0: 160, 1: 360, 2: 590 };
const COL_X0 = 90;
const COL_W = 150;
const SUB_UNIT = 70;
const NODE_W = 128;
const NODE_H = 60;

let progress = loadProgress();
let selectedId = null;

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("Failed to load progress", e);
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function getStatus(id) {
  return (progress[id] && progress[id].status) || "not-started";
}

function getNotes(id) {
  return (progress[id] && progress[id].notes) || [];
}

function setStatus(id, status) {
  if (!progress[id]) progress[id] = { status: "not-started", notes: [] };
  progress[id].status = status;
  saveProgress();
  renderChart();
  renderBackground();
  renderSummary();
  if (selectedId === id) renderDetail(id);
}

function addNote(id, text) {
  if (!text.trim()) return;
  if (!progress[id]) progress[id] = { status: "not-started", notes: [] };
  progress[id].notes.unshift({
    id: Date.now(),
    date: new Date().toISOString().slice(0, 10),
    text: text.trim(),
  });
  saveProgress();
  renderDetail(id);
}

function deleteNote(id, noteId) {
  if (!progress[id]) return;
  progress[id].notes = progress[id].notes.filter((n) => n.id !== noteId);
  saveProgress();
  renderDetail(id);
}

function nodePos(stage) {
  const x = COL_X0 + stage.col * COL_W;
  const y = ROW_Y[stage.row] + stage.sub * SUB_UNIT;
  return { x, y };
}

function statusColorVar(status) {
  if (status === "mastered") return "var(--status-mastered)";
  if (status === "in-progress") return "var(--status-in-progress)";
  return "var(--status-not-started)";
}

function trackColorVar(track) {
  return {
    A: "var(--track-a)",
    B: "var(--track-b)",
    M: "var(--track-m)",
    F: "var(--track-f)",
    BG: "var(--track-bg)",
  }[track];
}

function renderChart() {
  const svg = document.getElementById("timeline");
  const flowStages = STAGES.filter((s) => s.row !== null);

  const maxCol = Math.max(...flowStages.map((s) => s.col));
  const width = COL_X0 + maxCol * COL_W + 140;
  const height = 740;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);

  let html = "";

  // lane labels
  html += `<text class="lane-label" x="20" y="30" fill="var(--track-a)">TRACK A — BALANCE</text>`;
  html += `<text class="lane-label" x="20" y="${ROW_Y[1] - 60}" fill="var(--track-m)">MERGED — WALL HSPU SEQUENCE</text>`;
  html += `<text class="lane-label" x="20" y="${ROW_Y[2] - 90}" fill="var(--track-b)">TRACK B — PRESSING STRENGTH</text>`;

  // connectors first (so nodes draw on top)
  flowStages.forEach((stage) => {
    const to = nodePos(stage);
    stage.dependsOn.forEach((depId) => {
      const dep = STAGE_MAP[depId];
      if (!dep || dep.row === null) return;
      const from = nodePos(dep);
      const x1 = from.x + NODE_W / 2;
      const y1 = from.y;
      const x2 = to.x - NODE_W / 2;
      const y2 = to.y;
      const cx1 = x1 + (x2 - x1) * 0.5;
      const cx2 = x1 + (x2 - x1) * 0.5;
      const cls = stage.optional ? "conn optional" : "conn";
      html += `<path class="${cls}" d="M ${x1},${y1} C ${cx1},${y1} ${cx2},${y2} ${x2},${y2}" />`;
    });
  });

  // nodes
  flowStages.forEach((stage) => {
    const { x, y } = nodePos(stage);
    const status = getStatus(stage.id);
    const fill = statusColorVar(status);
    const stroke = trackColorVar(stage.track);
    const rx = x - NODE_W / 2;
    const ry = y - NODE_H / 2;
    const isSelected = selectedId === stage.id ? "selected" : "";
    const opacity = stage.optional ? 0.75 : 1;

    html += `<g class="node ${isSelected}" data-id="${stage.id}" opacity="${opacity}">
      <rect x="${rx}" y="${ry}" width="${NODE_W}" height="${NODE_H}" rx="9" style="fill:${fill}; stroke:${stroke};" />
      <text class="title" x="${x}" y="${y - 4}" text-anchor="middle">${wrap(stage.title, 20)[0] || ""}</text>
      <text class="title" x="${x}" y="${y + 10}" text-anchor="middle">${wrap(stage.title, 20)[1] || ""}</text>
      <text class="subtitle" x="${x}" y="${y + NODE_H / 2 - 4}" text-anchor="middle">${stage.id}${stage.gate ? " · gate" : ""}${stage.optional ? " · optional" : ""}</text>
    </g>`;
  });

  svg.innerHTML = html;

  svg.querySelectorAll(".node").forEach((el) => {
    el.addEventListener("click", () => {
      selectedId = el.getAttribute("data-id");
      renderChart();
      renderDetail(selectedId);
    });
  });
}

function wrap(text, maxLen) {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  words.forEach((w) => {
    if ((cur + " " + w).trim().length > maxLen) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  });
  if (cur) lines.push(cur.trim());
  return lines.slice(0, 2);
}

function renderBackground() {
  const wrap = document.getElementById("bg-cards");
  const bgStages = STAGES.filter((s) => s.track === "BG");
  wrap.innerHTML = bgStages
    .map((stage) => {
      const status = getStatus(stage.id);
      return `<div class="bg-card" data-id="${stage.id}">
        <h3>${stage.title}</h3>
        <div style="color:var(--muted); font-size:11px;">${stage.subtitle}</div>
        <div class="status-pill">${statusPillHtml(stage.id, status)}</div>
      </div>`;
    })
    .join("");

  wrap.querySelectorAll(".bg-card").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".status-btn")) return;
      selectedId = el.getAttribute("data-id");
      renderDetail(selectedId);
    });
  });

  attachStatusBtnListeners(wrap);
}

function statusPillHtml(id, currentStatus) {
  const statuses = [
    ["not-started", "Not started"],
    ["in-progress", "In progress"],
    ["mastered", "Mastered"],
  ];
  return statuses
    .map(
      ([val, label]) =>
        `<button class="status-btn ${currentStatus === val ? "active" : ""}" data-status="${val}" data-id="${id}">${label}</button>`
    )
    .join("");
}

function attachStatusBtnListeners(root) {
  root.querySelectorAll(".status-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setStatus(btn.getAttribute("data-id"), btn.getAttribute("data-status"));
    });
  });
}

function renderDetail(id) {
  const panel = document.getElementById("detail-panel");
  if (!id) {
    panel.className = "detail-panel empty";
    panel.innerHTML = "Click a stage in the timeline to view its mastery criteria, update status, and log notes.";
    return;
  }
  const stage = STAGE_MAP[id];
  const status = getStatus(id);
  const notes = getNotes(id);
  panel.className = "detail-panel";

  panel.innerHTML = `
    <h2>${stage.title}</h2>
    <span class="track-tag" style="background:${trackColorVar(stage.track)}; color:#0b0d11;">${TRACKS[stage.track].label}</span>
    <div class="subtitle">${stage.subtitle || ""}${stage.gate ? " — requires both tracks" : ""}${stage.optional ? " — optional branch" : ""}</div>
    <div class="criteria-box">
      <div class="heading">Mastery criteria</div>
      ${stage.masteryCriteria}
    </div>
    ${stage.dependsOn.length ? `<div class="criteria-box"><div class="heading">Prerequisites</div>${stage.dependsOn.map((d) => STAGE_MAP[d].title).join(", ")}</div>` : ""}
    <div class="heading" style="margin-bottom:6px;">Status</div>
    <div class="status-pill">${statusPillHtml(id, status)}</div>
    <div class="notes-section">
      <h3>Progress notes</h3>
      <textarea class="note-input" id="note-input" placeholder="e.g. Held handstand for 20 sec today"></textarea>
      <button class="note-add-btn" id="note-add-btn">Add note</button>
      <div class="note-list">
        ${notes
          .map(
            (n) => `<div class="note-item">
              <span class="note-del" data-note-id="${n.id}">delete</span>
              <div class="note-date">${n.date}</div>
              <div>${escapeHtml(n.text)}</div>
            </div>`
          )
          .join("")}
      </div>
    </div>
  `;

  attachStatusBtnListeners(panel);

  panel.querySelector("#note-add-btn").addEventListener("click", () => {
    const input = panel.querySelector("#note-input");
    addNote(id, input.value);
  });

  panel.querySelectorAll(".note-del").forEach((el) => {
    el.addEventListener("click", () => {
      deleteNote(id, Number(el.getAttribute("data-note-id")));
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function trackStats(trackIds) {
  const stages = STAGES.filter((s) => trackIds.includes(s.track) && !s.optional);
  const mastered = stages.filter((s) => getStatus(s.id) === "mastered").length;
  return { mastered, total: stages.length };
}

function renderSummary() {
  const summary = document.getElementById("progress-summary");
  const a = trackStats(["A"]);
  const b = trackStats(["B"]);
  const merged = trackStats(["M", "F"]);
  const overall = trackStats(["A", "B", "M", "F"]);

  const cards = [
    { label: "Track A — Balance", stat: a, color: "var(--track-a)" },
    { label: "Track B — Pressing", stat: b, color: "var(--track-b)" },
    { label: "Wall HSPU → Freestanding", stat: merged, color: "var(--track-m)" },
    { label: "Overall progress", stat: overall, color: "var(--track-f)" },
  ];

  summary.innerHTML = cards
    .map((c) => {
      const pct = c.stat.total ? Math.round((c.stat.mastered / c.stat.total) * 100) : 0;
      return `<div class="progress-card">
        <div class="label"><span>${c.label}</span><span>${c.stat.mastered}/${c.stat.total}</span></div>
        <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%; background:${c.color};"></div></div>
      </div>`;
    })
    .join("");
}

function exportData() {
  const blob = new Blob([JSON.stringify(progress, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hspu-progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      progress = parsed;
      saveProgress();
      renderChart();
      renderBackground();
      renderSummary();
      renderDetail(null);
      selectedId = null;
    } catch (e) {
      alert("Invalid JSON file.");
    }
  };
  reader.readAsText(file);
}

function init() {
  renderSummary();
  renderChart();
  renderBackground();
  renderDetail(null);

  document.getElementById("export-btn").addEventListener("click", exportData);
  document.getElementById("import-btn").addEventListener("click", () => {
    document.getElementById("import-file").click();
  });
  document.getElementById("import-file").addEventListener("change", (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
  });
}

document.addEventListener("DOMContentLoaded", init);
