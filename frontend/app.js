const $ = (id) => document.getElementById(id);

const apiBase = $("apiBase");
const fileIn = $("file");
const img = $("img");
const stage = $("stage");
const boxes = $("boxes");
const roiList = $("roiList");
const out = $("out");
const confIn = $("conf");
const autoBtn = $("autoBtn");
const manualBtn = $("manualBtn");
const clearBtn = $("clearBtn");
const pingBtn = $("pingBtn");
const pingOut = $("pingOut");

// Pon aquí tu Cloud Run URL por default:
apiBase.value = "https://irflies-api-twfkbbgmxa-pv.a.run.app";

let rois = [];         // [{x1,y1,x2,y2,score,label}]
let lastResponse = null;

// --- Utilidades ---
function pretty(obj) {
  out.textContent = JSON.stringify(obj ?? {}, null, 2);
}

function getScale() {
  // Convierte coords display -> coords natural
  const rect = img.getBoundingClientRect();
  const sx = img.naturalWidth / rect.width;
  const sy = img.naturalHeight / rect.height;
  return { rect, sx, sy };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function draw() {
  boxes.innerHTML = "";
  roiList.innerHTML = "";

  const { rect } = getScale();
  const dispW = rect.width;
  const dispH = rect.height;

  rois.forEach((r, idx) => {
    // dibujar en coords display
    const x = (r.x1 / img.naturalWidth) * dispW;
    const y = (r.y1 / img.naturalHeight) * dispH;
    const w = ((r.x2 - r.x1) / img.naturalWidth) * dispW;
    const h = ((r.y2 - r.y1) / img.naturalHeight) * dispH;

    const el = document.createElement("div");
    el.className = "box";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;

    const tag = document.createElement("div");
    tag.className = "tag";

    // Si hay respuesta del pipeline, muestra label/score del clasificador para este ROI
    let clsTag = "";
    if (lastResponse?.predictions?.[idx]?.classification) {
      const c = lastResponse.predictions[idx].classification;
      clsTag = ` | ${c.label} (${(c.score ?? 0).toFixed(3)})`;
    }
    const yoloTag = (r.label ? r.label : "manual") + (r.score != null ? ` ${(r.score).toFixed(3)}` : "");
    tag.textContent = `#${idx} ${yoloTag}${clsTag}`;

    el.appendChild(tag);
    boxes.appendChild(el);

    // lista
    const item = document.createElement("div");
    item.className = "item";
    const left = document.createElement("div");
    left.innerHTML = `<code>${idx}: [${r.x1},${r.y1}] - [${r.x2},${r.y2}]</code>`;
    const btn = document.createElement("button");
    btn.textContent = "Borrar";
    btn.onclick = () => {
      rois.splice(idx, 1);
      lastResponse = null;
      pretty(lastResponse);
      draw();
    };
    item.appendChild(left);
    item.appendChild(btn);
    roiList.appendChild(item);
  });
}

function setBusy(b) {
  autoBtn.disabled = b;
  manualBtn.disabled = b;
  pingBtn.disabled = b;
}

// --- Cargar imagen ---
fileIn.addEventListener("change", () => {
  const f = fileIn.files?.[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  img.onload = () => {
    rois = [];
    lastResponse = null;
    pretty(lastResponse);
    draw();
  };
  img.src = url;
});

// --- ROI draw (click & drag) ---
let drawing = false;
let start = null;

stage.addEventListener("mousedown", (e) => {
  if (!img.src) return;
  drawing = true;
  start = { x: e.clientX, y: e.clientY };
});

window.addEventListener("mouseup", (e) => {
  if (!drawing || !start) return;
  drawing = false;

  const { rect, sx, sy } = getScale();
  const x1d = clamp(Math.min(start.x, e.clientX) - rect.left, 0, rect.width);
  const y1d = clamp(Math.min(start.y, e.clientY) - rect.top, 0, rect.height);
  const x2d = clamp(Math.max(start.x, e.clientX) - rect.left, 0, rect.width);
  const y2d = clamp(Math.max(start.y, e.clientY) - rect.top, 0, rect.height);

  // a coords natural
  const x1 = Math.round(x1d * sx);
  const y1 = Math.round(y1d * sy);
  const x2 = Math.round(x2d * sx);
  const y2 = Math.round(y2d * sy);

  if (x2 > x1 + 2 && y2 > y1 + 2) {
    rois.push({ x1, y1, x2, y2, score: null, label: null });
    lastResponse = null;
    pretty(lastResponse);
    draw();
  }
  start = null;
});

clearBtn.addEventListener("click", () => {
  rois = [];
  lastResponse = null;
  pretty(lastResponse);
  draw();
});

// --- API calls ---
pingBtn.addEventListener("click", async () => {
  try {
    pingOut.textContent = "…";
    const r = await fetch(`${apiBase.value}/health`);
    const j = await r.json();
    pingOut.textContent = j.ok ? "ok" : "fail";
  } catch (e) {
    pingOut.textContent = "error";
  }
});

async function postForm(url, formData) {
  const r = await fetch(url, { method: "POST", body: formData });
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch { throw new Error(`Non-JSON: ${text.slice(0,200)}`); }
  if (!r.ok) throw new Error(j?.detail ?? `HTTP ${r.status}`);
  return j;
}

// Auto (YOLO+classify)
autoBtn.addEventListener("click", async () => {
  const f = fileIn.files?.[0];
  if (!f) return alert("Sube una imagen primero.");
  setBusy(true);
  try {
    const fd = new FormData();
    fd.append("file", f);
    fd.append("conf", String(confIn.value || "0.01"));
    const j = await postForm(`${apiBase.value}/v1/pipeline/upload`, fd);
    lastResponse = j;
    rois = j.rois || [];
    pretty(j);
    draw();
  } catch (e) {
    alert(String(e));
  } finally {
    setBusy(false);
  }
});

// Manual classify (usa rois_json)
manualBtn.addEventListener("click", async () => {
  const f = fileIn.files?.[0];
  if (!f) return alert("Sube una imagen primero.");
  if (!rois.length) return alert("Dibuja al menos 1 ROI.");
  setBusy(true);
  try {
    const fd = new FormData();
    fd.append("file", f);
    fd.append("rois_json", JSON.stringify(rois.map(r => ({
      x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2
    }))));
    // conf no hace falta en modo manual (pero no estorba si lo mandas)
    const j = await postForm(`${apiBase.value}/v1/pipeline/upload`, fd);
    lastResponse = j;
    // rois regresan sin score/label (normal). Conserva los tuyos:
    pretty(j);
    draw();
  } catch (e) {
    alert(String(e));
  } finally {
    setBusy(false);
  }
});
