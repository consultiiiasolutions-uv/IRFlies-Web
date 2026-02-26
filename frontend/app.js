const $ = (id) => document.getElementById(id);

const apiBase = $("apiBase");
const fileIn = $("file");
const img = $("img");
const stage = $("stage");
const boxes = $("boxes");
const roiList = $("roiList");
const confIn = $("conf");

const pingBtn = $("pingBtn");
const pingOut = $("pingOut");

const detectBtn = $("detectBtn");
const classifyBtn = $("classifyBtn");
const selectBtn = $("selectBtn");
const drawBtn = $("drawBtn");
const deleteBtn = $("deleteBtn");
const clearBtn = $("clearBtn");

const msg = $("msg");
const modeOut = $("modeOut");
const roiCountOut = $("roiCountOut");
const fileOut = $("fileOut");

const sumRois = $("sumRois");
const sumClass = $("sumClass");
const sumScore = $("sumScore");
const resultsBody = $("resultsBody");

// Base actual
apiBase.value = "https://irflies-api-twfkbbgmxa-pv.a.run.app";

let rois = []; // [{x1,y1,x2,y2,score,label}]
let lastResponse = null;
let selectedIdx = null;
let mode = "select"; // select | draw

let pointerState = null; // draw | move | resize
let previewRect = null;

const MIN_SIZE = 6;

// --- Utilidades ---
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function setMessage(text, type = "info") {
  msg.textContent = text;
  msg.className = `msg ${type}`;
}

function getScale() {
  const rect = img.getBoundingClientRect();
  const sx = img.naturalWidth / rect.width;
  const sy = img.naturalHeight / rect.height;
  return { rect, sx, sy };
}

function setBusy(b) {
  detectBtn.disabled = b;
  classifyBtn.disabled = b;
  pingBtn.disabled = b;
  clearBtn.disabled = b;
  deleteBtn.disabled = b || selectedIdx == null;
}

function setMode(nextMode) {
  mode = nextMode;
  modeOut.textContent = `Modo: ${mode === "draw" ? "dibujar" : "seleccionar"}`;
  selectBtn.classList.toggle("activeMode", mode === "select");
  drawBtn.classList.toggle("activeMode", mode === "draw");
}

function updateTopInfo() {
  roiCountOut.textContent = `ROIs: ${rois.length}`;
  fileOut.textContent = fileIn.files?.[0]?.name || "Sin imagen cargada";
  deleteBtn.disabled = selectedIdx == null;
}

function normalizeBox(r) {
  let x1 = Math.min(r.x1, r.x2);
  let y1 = Math.min(r.y1, r.y2);
  let x2 = Math.max(r.x1, r.x2);
  let y2 = Math.max(r.y1, r.y2);

  x1 = clamp(Math.round(x1), 0, img.naturalWidth);
  y1 = clamp(Math.round(y1), 0, img.naturalHeight);
  x2 = clamp(Math.round(x2), 0, img.naturalWidth);
  y2 = clamp(Math.round(y2), 0, img.naturalHeight);

  if (x2 < x1 + MIN_SIZE) x2 = x1 + MIN_SIZE;
  if (y2 < y1 + MIN_SIZE) y2 = y1 + MIN_SIZE;

  x2 = clamp(x2, 0, img.naturalWidth);
  y2 = clamp(y2, 0, img.naturalHeight);

  return { x1, y1, x2, y2 };
}

function extractClassification(idx) {
  const pred = lastResponse?.predictions?.[idx];
  if (!pred) return null;

  const cls = pred.classification || pred;
  if (!cls) return null;

  return {
    label: cls.label ?? "—",
    score: Number(cls.score ?? 0),
    probs: cls.probs ?? {},
  };
}

function dominantClass() {
  const counts = {};
  for (let i = 0; i < rois.length; i++) {
    const cls = extractClassification(i);
    if (!cls?.label) continue;
    counts[cls.label] = (counts[cls.label] || 0) + 1;
  }

  let best = null;
  let bestCount = -1;
  for (const [label, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return best || "—";
}

function meanScore() {
  const values = [];
  for (let i = 0; i < rois.length; i++) {
    const cls = extractClassification(i);
    if (cls && Number.isFinite(cls.score)) values.push(cls.score);
  }
  if (!values.length) return "—";
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return avg.toFixed(3);
}

function renderSummary() {
  sumRois.textContent = String(rois.length);
  sumClass.textContent = dominantClass();
  sumScore.textContent = meanScore();
}

function renderResults() {
  if (!rois.length) {
    resultsBody.innerHTML = `
      <tr>
        <td colspan="5" class="emptyCell">Todavía no hay clasificación.</td>
      </tr>
    `;
    renderSummary();
    return;
  }

  const rows = rois.map((r, idx) => {
    const cls = extractClassification(idx);
    const probs = cls?.probs || {};
    const probsHtml = Object.keys(probs).length
      ? `<div class="probList">${Object.entries(probs)
          .map(([k, v]) => `<span class="probChip">${k}: ${Number(v).toFixed(3)}</span>`)
          .join("")}</div>`
      : "—";

    return `
      <tr>
        <td>ROI ${idx}</td>
        <td>${cls ? `<span class="badge">${cls.label}</span>` : "Pendiente"}</td>
        <td>${cls ? Number(cls.score).toFixed(3) : "—"}</td>
        <td>${probsHtml}</td>
        <td><code>[${r.x1}, ${r.y1}] - [${r.x2}, ${r.y2}]</code></td>
      </tr>
    `;
  }).join("");

  resultsBody.innerHTML = rows;
  renderSummary();
}

function renderRoiList() {
  roiList.innerHTML = "";

  if (!rois.length) {
    roiList.innerHTML = `<div class="muted">No hay ROIs todavía.</div>`;
    return;
  }

  rois.forEach((r, idx) => {
    const cls = extractClassification(idx);

    const item = document.createElement("div");
    item.className = "item";

    const left = document.createElement("div");
    left.className = "itemLeft";

    const top = document.createElement("div");
    top.className = "itemTop";

    const title = document.createElement("strong");
    title.textContent = `ROI ${idx}`;
    top.appendChild(title);

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = cls ? `${cls.label} (${cls.score.toFixed(3)})` : (r.label || "manual");
    top.appendChild(badge);

    const coords = document.createElement("code");
    coords.textContent = `[${r.x1}, ${r.y1}] - [${r.x2}, ${r.y2}]`;

    left.appendChild(top);
    left.appendChild(coords);

    const actions = document.createElement("div");
    actions.className = "itemActions";

    const selBtn = document.createElement("button");
    selBtn.textContent = selectedIdx === idx ? "Seleccionado" : "Seleccionar";
    selBtn.onclick = () => {
      selectedIdx = idx;
      draw();
      updateTopInfo();
    };

    const delBtn = document.createElement("button");
    delBtn.textContent = "Borrar";
    delBtn.onclick = () => {
      rois.splice(idx, 1);
      if (selectedIdx === idx) selectedIdx = null;
      if (selectedIdx != null && selectedIdx > idx) selectedIdx -= 1;
      lastResponse = null;
      draw();
      renderResults();
      updateTopInfo();
    };

    actions.appendChild(selBtn);
    actions.appendChild(delBtn);

    item.appendChild(left);
    item.appendChild(actions);
    roiList.appendChild(item);
  });
}

function drawPreview() {
  if (!previewRect) return;

  const { rect } = getScale();
  const x = (previewRect.x1 / img.naturalWidth) * rect.width;
  const y = (previewRect.y1 / img.naturalHeight) * rect.height;
  const w = ((previewRect.x2 - previewRect.x1) / img.naturalWidth) * rect.width;
  const h = ((previewRect.y2 - previewRect.y1) / img.naturalHeight) * rect.height;

  const el = document.createElement("div");
  el.className = "previewBox";
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  boxes.appendChild(el);
}

function draw() {
  boxes.innerHTML = "";

  if (!img.naturalWidth || !img.naturalHeight) {
    renderRoiList();
    renderResults();
    return;
  }

  const { rect } = getScale();
  const dispW = rect.width;
  const dispH = rect.height;

  rois.forEach((r, idx) => {
    const x = (r.x1 / img.naturalWidth) * dispW;
    const y = (r.y1 / img.naturalHeight) * dispH;
    const w = ((r.x2 - r.x1) / img.naturalWidth) * dispW;
    const h = ((r.y2 - r.y1) / img.naturalHeight) * dispH;

    const el = document.createElement("div");
    el.className = "box" + (selectedIdx === idx ? " selected" : "");
    el.dataset.idx = String(idx);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;

    const tag = document.createElement("div");
    tag.className = "tag";

    const cls = extractClassification(idx);
    const yoloTag =
      (r.label ? r.label : "manual") +
      (r.score != null ? ` ${Number(r.score).toFixed(3)}` : "");

    tag.textContent = cls
      ? `#${idx} ${cls.label} (${cls.score.toFixed(3)})`
      : `#${idx} ${yoloTag}`;

    el.appendChild(tag);

    if (selectedIdx === idx) {
      ["nw", "ne", "sw", "se"].forEach((name) => {
        const h = document.createElement("div");
        h.className = `handle ${name}`;
        h.dataset.idx = String(idx);
        h.dataset.handle = name;
        el.appendChild(h);
      });
    }

    boxes.appendChild(el);
  });

  drawPreview();
  renderRoiList();
  renderResults();
}

// --- Archivo ---
fileIn.addEventListener("change", () => {
  const f = fileIn.files?.[0];
  if (!f) return;

  const url = URL.createObjectURL(f);
  img.onload = () => {
    rois = [];
    lastResponse = null;
    selectedIdx = null;
    previewRect = null;
    draw();
    updateTopInfo();
    setMessage("Imagen cargada. Puedes detectar ojos o dibujar ROIs manualmente.", "info");
  };
  img.src = url;
});

selectBtn.addEventListener("click", () => setMode("select"));
drawBtn.addEventListener("click", () => setMode("draw"));

clearBtn.addEventListener("click", () => {
  rois = [];
  lastResponse = null;
  selectedIdx = null;
  previewRect = null;
  draw();
  updateTopInfo();
  setMessage("Se limpiaron todos los ROIs.", "info");
});

deleteBtn.addEventListener("click", () => {
  if (selectedIdx == null) return;
  rois.splice(selectedIdx, 1);
  lastResponse = null;
  selectedIdx = null;
  draw();
  updateTopInfo();
  setMessage("ROI seleccionado eliminado.", "info");
});

// --- Pointer Events ---
stage.style.touchAction = "none";

stage.addEventListener("pointerdown", (e) => {
  if (!img.src) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;

  const handle = e.target.closest(".handle");
  const box = e.target.closest(".box");

  const { rect, sx, sy } = getScale();
  const x = clamp(Math.round((e.clientX - rect.left) * sx), 0, img.naturalWidth);
  const y = clamp(Math.round((e.clientY - rect.top) * sy), 0, img.naturalHeight);

  if (mode === "draw") {
    pointerState = {
      type: "draw",
      startX: x,
      startY: y,
      pointerId: e.pointerId,
    };
    previewRect = { x1: x, y1: y, x2: x, y2: y };
    stage.setPointerCapture(e.pointerId);
    draw();
    return;
  }

  if (handle) {
    const idx = Number(handle.dataset.idx);
    selectedIdx = idx;
    const roi = rois[idx];
    pointerState = {
      type: "resize",
      idx,
      handle: handle.dataset.handle,
      startX: x,
      startY: y,
      orig: { ...roi },
      pointerId: e.pointerId,
    };
    stage.setPointerCapture(e.pointerId);
    draw();
    updateTopInfo();
    return;
  }

  if (box) {
    const idx = Number(box.dataset.idx);
    selectedIdx = idx;
    const roi = rois[idx];
    pointerState = {
      type: "move",
      idx,
      startX: x,
      startY: y,
      orig: { ...roi },
      pointerId: e.pointerId,
    };
    stage.setPointerCapture(e.pointerId);
    draw();
    updateTopInfo();
    return;
  }

  selectedIdx = null;
  draw();
  updateTopInfo();
});

stage.addEventListener("pointermove", (e) => {
  if (!pointerState) return;

  const { rect, sx, sy } = getScale();
  const x = clamp(Math.round((e.clientX - rect.left) * sx), 0, img.naturalWidth);
  const y = clamp(Math.round((e.clientY - rect.top) * sy), 0, img.naturalHeight);

  if (pointerState.type === "draw") {
    previewRect = normalizeBox({
      x1: pointerState.startX,
      y1: pointerState.startY,
      x2: x,
      y2: y,
    });
    draw();
    return;
  }

  if (pointerState.type === "move") {
    const roi = rois[pointerState.idx];
    if (!roi) return;

    const dx = x - pointerState.startX;
    const dy = y - pointerState.startY;

    const w = pointerState.orig.x2 - pointerState.orig.x1;
    const h = pointerState.orig.y2 - pointerState.orig.y1;

    let nx1 = pointerState.orig.x1 + dx;
    let ny1 = pointerState.orig.y1 + dy;

    nx1 = clamp(nx1, 0, img.naturalWidth - w);
    ny1 = clamp(ny1, 0, img.naturalHeight - h);

    roi.x1 = Math.round(nx1);
    roi.y1 = Math.round(ny1);
    roi.x2 = Math.round(nx1 + w);
    roi.y2 = Math.round(ny1 + h);

    lastResponse = null;
    draw();
    return;
  }

  if (pointerState.type === "resize") {
    const roi = rois[pointerState.idx];
    if (!roi) return;

    let next = { ...pointerState.orig };

    if (pointerState.handle.includes("n")) next.y1 = y;
    if (pointerState.handle.includes("s")) next.y2 = y;
    if (pointerState.handle.includes("w")) next.x1 = x;
    if (pointerState.handle.includes("e")) next.x2 = x;

    next = normalizeBox(next);

    roi.x1 = next.x1;
    roi.y1 = next.y1;
    roi.x2 = next.x2;
    roi.y2 = next.y2;

    lastResponse = null;
    draw();
  }
});

stage.addEventListener("pointerup", (e) => {
  if (!pointerState) return;

  if (pointerState.type === "draw" && previewRect) {
    if (
      previewRect.x2 > previewRect.x1 + 2 &&
      previewRect.y2 > previewRect.y1 + 2
    ) {
      rois.push({
        x1: previewRect.x1,
        y1: previewRect.y1,
        x2: previewRect.x2,
        y2: previewRect.y2,
        score: null,
        label: null,
      });
      selectedIdx = rois.length - 1;
      lastResponse = null;
      setMessage("ROI manual agregado.", "ok");
    }
  }

  previewRect = null;
  pointerState = null;

  try {
    stage.releasePointerCapture(e.pointerId);
  } catch (_) {}

  draw();
  updateTopInfo();
});

stage.addEventListener("pointercancel", () => {
  pointerState = null;
  previewRect = null;
  draw();
});

// --- API ---
pingBtn.addEventListener("click", async () => {
  try {
    pingOut.textContent = "Verificando...";
    const r = await fetch(`${apiBase.value}/health`);
    const j = await r.json();
    pingOut.textContent = j.ok ? "Backend disponible" : "Backend sin respuesta";
  } catch (e) {
    pingOut.textContent = "Error";
  }
});

async function postForm(url, formData) {
  const r = await fetch(url, { method: "POST", body: formData });
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`Respuesta no JSON: ${text.slice(0, 200)}`);
  }
  if (!r.ok) throw new Error(j?.detail ?? `HTTP ${r.status}`);
  return j;
}

function normalizeDetectResponse(j) {
  const arr = j?.rois || j?.boxes || j?.detections || [];
  if (!Array.isArray(arr)) return [];

  const thr = Number(confIn.value || 0.25);

  return arr
    .map((r) => ({
      x1: Number(r.x1),
      y1: Number(r.y1),
      x2: Number(r.x2),
      y2: Number(r.y2),
      score: r.score != null ? Number(r.score) : null,
      label: r.label ?? "eyes",
    }))
    .filter((r) => r.score == null || r.score >= thr)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

// 1) Detectar solamente
detectBtn.addEventListener("click", async () => {
  const f = fileIn.files?.[0];
  if (!f) return alert("Sube una imagen primero.");

  setBusy(true);
  try {
    const fd = new FormData();
    fd.append("file", f);
    fd.append("conf", String(confIn.value || "0.01"));

    const j = await postForm(`${apiBase.value}/v1/detect/upload`, fd);

    rois = normalizeDetectResponse(j);
    lastResponse = null;
    selectedIdx = rois.length ? 0 : null;

    draw();
    updateTopInfo();

    if (rois.length) {
      setMessage(`Se detectaron ${rois.length} ROI(s). Revisa o corrige antes de clasificar.`, "ok");
    } else {
      setMessage("No se detectaron ojos. Puedes dibujar ROIs manualmente.", "info");
    }
  } catch (e) {
    alert(String(e));
    setMessage(String(e), "err");
  } finally {
    setBusy(false);
  }
});

// 2) Clasificar ROIs actuales
classifyBtn.addEventListener("click", async () => {
  const f = fileIn.files?.[0];
  if (!f) return alert("Sube una imagen primero.");
  if (!rois.length) return alert("No hay ROIs para clasificar.");

  setBusy(true);
  try {
    const fd = new FormData();
    fd.append("file", f);
    fd.append(
      "rois_json",
      JSON.stringify(
        rois.map((r) => ({
          x1: r.x1,
          y1: r.y1,
          x2: r.x2,
          y2: r.y2,
        }))
      )
    );

    const j = await postForm(`${apiBase.value}/v1/pipeline/upload`, fd);
    lastResponse = j;

    draw();
    updateTopInfo();
    setMessage("Clasificación completada.", "ok");
  } catch (e) {
    alert(String(e));
    setMessage(String(e), "err");
  } finally {
    setBusy(false);
  }
});

// Estado inicial
setMode("select");
updateTopInfo();
renderSummary();
renderResults();
