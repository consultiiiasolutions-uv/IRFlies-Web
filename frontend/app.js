const $ = (id) => document.getElementById(id);

const apiBase = $("apiBase");
const fileIn = $("file");
const img = $("img");
const stage = $("stage");
const boxes = $("boxes");
const roiList = $("roiList");
const confIn = $("conf");
const exampleSelect = $("exampleSelect");

const pingBtn = $("pingBtn");
const pingOut = $("pingOut");
const backendStatus = $("backendStatus");
const langToggleBtn = $("langToggleBtn");

const classifyBtn = $("classifyBtn");
const openOriginalBtn = $("openOriginalBtn");
const clearHistoryBtn = $("clearHistoryBtn");
const exportCsvBtn = $("exportCsvBtn");

const prevImageBtn = $("prevImageBtn");
const nextImageBtn = $("nextImageBtn");
const imagePosition = $("imagePosition");

const msg = $("msg");
const modeOut = $("modeOut");
const roiCountOut = $("roiCountOut");
const fileOut = $("fileOut");
const previewFileName = $("previewFileName");

const sumRois = $("sumRois");
const sumClass = $("sumClass");
const sumScore = $("sumScore");
const currentResultsList = $("currentResultsList");
const historyBody = $("historyBody");

const DEFAULT_API_BASE = "https://irflies-api-twfkbbgmxa-pv.a.run.app";
apiBase.value = DEFAULT_API_BASE;

const MIN_SIZE = 6;

const EXAMPLE_FILES = [
  { fileName: "ef8_1.jpg", key: "ef8_1" },
  { fileName: "ef8_2.jpg", key: "ef8_2" },
  { fileName: "ef9_1.JPG", key: "ef9_1" },
  { fileName: "ef9_2.JPG", key: "ef9_2" },
];

let currentLang = localStorage.getItem("irflies_lang") || "es";

let rois = [];
let lastResponse = null;
let selectedIdx = null;
let mode = "select";

let pointerState = null;
let previewRect = null;

// Archivos seleccionados y navegación
let selectedFiles = [];
let currentFileIndex = -1;
let currentObjectUrl = null;

// Estado por imagen en la sesión actual
// imageStates[i] = { rois, lastResponse, selectedIdx, detectStatus, detectError }
let imageStates = [];

// Historial acumulado de sesión
let sessionHistory = [];

// Estado UI
let isBusy = false;
let autoDetectionRunning = false;
let backendState = "checking";

const translations = {
  es: {
    page: {
      title: "IRFlies Web",
    },
    hero: {
      brand: "IRFlies-Web",
      title: "Detección y clasificación de ojos",
      text:
        "Carga una o varias imágenes, navega una por una, detecta ojos automáticamente, corrige los ROIs si hace falta y clasifica después. El historial de resultados se conserva durante toda la sesión.",
    },
    tools: {
      summary: "Herramientas técnicas",
      apiBaseLabel: "API Base URL",
      ping: "Verificar backend",
      pingIdle: "Sin verificar",
      pingChecking: "Verificando...",
      pingAvailable: "Disponible",
      pingNoResponse: "Sin respuesta",
      pingError: "Error",
    },
    sections: {
      controls: "Imagen y acciones",
      image: "Imagen",
      summary: "Resumen",
      currentResults: "Resultados actuales",
      rois: "ROIs",
      history: "Historial de sesión",
      examples: "Probar ejemplos",
    },
    buttons: {
      classify: "Clasificar ROIs",
      openOriginal: "Ver imagen completa",
      exportCsv: "Exportar CSV",
      clearHistory: "Limpiar historial",
    },
    labels: {
      conf: "conf",
      currentFile: "Archivo actual",
      roisCurrent: "ROIs actuales",
      dominantClass: "Clase dominante",
      meanScore: "Score medio",
      example: "Ejemplo",
    },
    modes: {
      select: "seleccionar",
    },
    helper:
      "Toca o haz clic sobre un ROI para moverlo. Usa las esquinas para redimensionarlo.",
    status: {
      backendChecking: "Backend: verificando",
      backendAvailable: "Backend: disponible",
      backendNoResponse: "Backend: sin respuesta",
      backendError: "Backend: error",
      mode: "Modo: {mode}",
      rois: "ROIs: {count}",
      loadedFile: "Archivo: {name}",
      noImageLoaded: "Sin imagen cargada",
      imagePosition: "Imagen {current} de {total}",
      noImagesLoaded: "Sin imágenes cargadas",
      noneShort: "—",
    },
    messages: {
      initial:
        "Sube una o varias imágenes para comenzar. Al cargarlas, la detección se ejecutará automáticamente.",
      noImageSelected: "No hay imagen seleccionada.",
      backendOk: "El backend está disponible.",
      backendBad: "El backend respondió, pero no confirmó un estado correcto.",
      backendUnavailable: "No se pudo verificar el backend.",
      imageReadyClassified:
        "Imagen cargada: {name}. Ya contiene una clasificación guardada.",
      imageReadyWithRois:
        "Imagen cargada: {name}. Hay {count} ROI(s) listos para revisar o clasificar.",
      imageReadyNoDetected:
        "Imagen cargada: {name}. No se detectaron ojos; puedes ajustar el ROI si hace falta.",
      imageDetecting:
        "Imagen cargada: {name}. La detección automática sigue en proceso.",
      detectError:
        "No se pudo detectar automáticamente en {name}: {error}",
      roiDeleted: "ROI eliminado.",
      historyCleared: "Historial de sesión limpiado.",
      classifyDone:
        "Clasificación completada y guardada en el historial de sesión.",
      classifyNoRois: "No hay ROIs para clasificar.",
      exportDone: "Archivo CSV exportado.",
      exportEmpty: "No hay historial para exportar.",
      autoDetectStart:
        "Se inició la detección automática para {count} imagen(es).",
      autoDetectProgress:
        "Detectando ojos en {current} de {total}: {name}",
      autoDetectCompleted:
        "Detección automática completada en {count} imagen(es). Total de ROIs: {rois}.",
      autoDetectCompletedWithErrors:
        "La detección automática terminó con incidencias. Imágenes: {count}, ROIs: {rois}, fallas: {failures}.",
      openOriginalMissing: "No hay imagen para abrir.",
      unexpected: "Ocurrió un error: {error}",
      exampleLoading: "Cargando ejemplo: {name}",
      exampleLoadError: "No se pudo cargar el ejemplo {name}: {error}",
    },
    roiList: {
      empty: "No hay ROIs todavía.",
      pending: "Pendiente",
      manual: "manual",
      auto: "detectado",
      size: "Tamaño: {width} × {height} px",
      select: "Seleccionar",
      selected: "Seleccionado",
      delete: "Borrar",
    },
    results: {
      empty: "Todavía no hay resultados para esta imagen.",
      pending: "Pendiente de clasificación",
      detection: "Detección automática",
      manual: "ROI manual",
      score: "Score: {score}",
      probabilities: "Probabilidades",
    },
    history: {
      empty: "Todavía no hay resultados guardados en esta sesión.",
      headers: {
        file: "Archivo",
        rois: "ROIs",
        dominantClass: "Clase dominante",
        meanScore: "Score medio",
        detail: "Detalle",
      },
      detailItem: "ROI {roi}: {label} ({score})",
      noDetail: "Sin detalle",
    },
    examples: {
      hint: "Selecciona un ejemplo y se cargará automáticamente.",
      placeholder: "Selecciona un ejemplo…",
      ef8_1: "Ejemplo EF8 1",
      ef8_2: "Ejemplo EF8 2",
      ef9_1: "Ejemplo EF9 1",
      ef9_2: "Ejemplo EF9 2",
    },
  },
  en: {
    page: {
      title: "IRFlies Web",
    },
    hero: {
      brand: "IRFlies-Web",
      title: "Eye detection and classification",
      text:
        "Upload one or more images, move through them one by one, detect eyes automatically, adjust ROIs if needed, and classify afterward. Session history is preserved during the whole session.",
    },
    tools: {
      summary: "Technical tools",
      apiBaseLabel: "API Base URL",
      ping: "Check backend",
      pingIdle: "Not checked",
      pingChecking: "Checking...",
      pingAvailable: "Available",
      pingNoResponse: "No response",
      pingError: "Error",
    },
    sections: {
      controls: "Image and actions",
      image: "Image",
      summary: "Summary",
      currentResults: "Current results",
      rois: "ROIs",
      history: "Session history",
      examples: "Try examples",
    },
    buttons: {
      classify: "Classify ROIs",
      openOriginal: "View full image",
      exportCsv: "Export CSV",
      clearHistory: "Clear history",
    },
    labels: {
      conf: "conf",
      currentFile: "Current file",
      roisCurrent: "Current ROIs",
      dominantClass: "Dominant class",
      meanScore: "Mean score",
      example: "Example",
    },
    modes: {
      select: "select",
    },
    helper:
      "Tap or click an ROI to move it. Use the corners to resize it.",
    status: {
      backendChecking: "Backend: checking",
      backendAvailable: "Backend: available",
      backendNoResponse: "Backend: no response",
      backendError: "Backend: error",
      mode: "Mode: {mode}",
      rois: "ROIs: {count}",
      loadedFile: "File: {name}",
      noImageLoaded: "No image loaded",
      imagePosition: "Image {current} of {total}",
      noImagesLoaded: "No images loaded",
      noneShort: "—",
    },
    messages: {
      initial:
        "Upload one or more images to begin. Automatic detection will run as soon as they are loaded.",
      noImageSelected: "No image selected.",
      backendOk: "The backend is available.",
      backendBad: "The backend responded, but did not confirm a valid state.",
      backendUnavailable: "The backend could not be checked.",
      imageReadyClassified:
        "Image loaded: {name}. A saved classification is already available.",
      imageReadyWithRois:
        "Image loaded: {name}. There are {count} ROI(s) ready to review or classify.",
      imageReadyNoDetected:
        "Image loaded: {name}. No eyes were detected; you can adjust the ROI if needed.",
      imageDetecting:
        "Image loaded: {name}. Automatic detection is still in progress.",
      detectError:
        "Automatic detection failed for {name}: {error}",
      roiDeleted: "ROI deleted.",
      historyCleared: "Session history cleared.",
      classifyDone:
        "Classification completed and saved in session history.",
      classifyNoRois: "There are no ROIs to classify.",
      exportDone: "CSV file exported.",
      exportEmpty: "There is no history to export.",
      autoDetectStart:
        "Automatic detection started for {count} image(s).",
      autoDetectProgress:
        "Detecting eyes in {current} of {total}: {name}",
      autoDetectCompleted:
        "Automatic detection completed for {count} image(s). Total ROIs: {rois}.",
      autoDetectCompletedWithErrors:
        "Automatic detection finished with issues. Images: {count}, ROIs: {rois}, failures: {failures}.",
      openOriginalMissing: "There is no image to open.",
      unexpected: "An error occurred: {error}",
      exampleLoading: "Loading example: {name}",
      exampleLoadError: "Could not load example {name}: {error}",
    },
    roiList: {
      empty: "There are no ROIs yet.",
      pending: "Pending",
      manual: "manual",
      auto: "detected",
      size: "Size: {width} × {height} px",
      select: "Select",
      selected: "Selected",
      delete: "Delete",
    },
    results: {
      empty: "There are no results for this image yet.",
      pending: "Pending classification",
      detection: "Automatic detection",
      manual: "Manual ROI",
      score: "Score: {score}",
      probabilities: "Probabilities",
    },
    history: {
      empty: "There are no saved results in this session yet.",
      headers: {
        file: "File",
        rois: "ROIs",
        dominantClass: "Dominant class",
        meanScore: "Mean score",
        detail: "Detail",
      },
      detailItem: "ROI {roi}: {label} ({score})",
      noDetail: "No detail",
    },
    examples: {
      hint: "Select an example and it will load automatically.",
      placeholder: "Select an example…",
      ef8_1: "EF8 example 1",
      ef8_2: "EF8 example 2",
      ef9_1: "EF9 example 1",
      ef9_2: "EF9 example 2",
    },
  },
};

// --- Utilidades generales ---
function lookupTranslation(source, key) {
  return key.split(".").reduce((acc, part) => {
    if (acc && Object.prototype.hasOwnProperty.call(acc, part)) {
      return acc[part];
    }
    return undefined;
  }, source);
}

function t(key, params = {}) {
  const current = lookupTranslation(translations[currentLang], key);
  const fallback = lookupTranslation(translations.es, key);
  const template = current ?? fallback ?? key;

  return String(template).replace(/\{(\w+)\}/g, (_, name) => {
    return params[name] != null ? String(params[name]) : `{${name}}`;
  });
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function deepClone(obj) {
  if (obj == null) return obj;
  return JSON.parse(JSON.stringify(obj));
}

function emptyImageState() {
  return {
    rois: [],
    lastResponse: null,
    selectedIdx: null,
    detectStatus: "idle",
    detectError: null,
  };
}

function getCurrentFile() {
  if (currentFileIndex < 0 || currentFileIndex >= selectedFiles.length) return null;
  return selectedFiles[currentFileIndex];
}

function getCurrentImageState() {
  if (currentFileIndex < 0 || currentFileIndex >= imageStates.length) return null;
  return imageStates[currentFileIndex];
}

function saveCurrentImageState() {
  if (currentFileIndex < 0 || currentFileIndex >= imageStates.length) return;

  const prev = imageStates[currentFileIndex] || emptyImageState();

  imageStates[currentFileIndex] = {
    ...prev,
    rois: deepClone(rois),
    lastResponse: deepClone(lastResponse),
    selectedIdx,
  };
}

function restoreCurrentImageState() {
  const state = getCurrentImageState() || emptyImageState();

  rois = deepClone(state.rois) || [];
  lastResponse = deepClone(state.lastResponse);
  selectedIdx = state.selectedIdx ?? null;

  previewRect = null;
  pointerState = null;
}

function resetVisualStateOnly() {
  rois = [];
  lastResponse = null;
  selectedIdx = null;
  previewRect = null;
  pointerState = null;
}

function setMessage(text, type = "info") {
  msg.textContent = text;
  msg.className = `msg ${type}`;
}

function setBusy(value) {
  isBusy = value;
  updateControlStates();
}

function updateControlStates() {
  const currentFile = getCurrentFile();
  const hasImage = !!currentFile;
  const hasRois = rois.length > 0;

  pingBtn.disabled = isBusy;
  classifyBtn.disabled = isBusy || !hasImage || !hasRois;
  openOriginalBtn.disabled = isBusy || !hasImage;
  clearHistoryBtn.disabled = isBusy || sessionHistory.length === 0;
  exportCsvBtn.disabled = isBusy || sessionHistory.length === 0;
  prevImageBtn.disabled = isBusy || currentFileIndex <= 0;
  nextImageBtn.disabled =
    isBusy ||
    currentFileIndex < 0 ||
    currentFileIndex >= selectedFiles.length - 1;
  fileIn.disabled = isBusy;
  confIn.disabled = isBusy;
  exampleSelect.disabled = isBusy;
}

function setMode() {
  mode = "select";
  modeOut.textContent = t("status.mode", {
    mode: t("modes.select"),
  });
}

function setBackendState(nextState) {
  backendState = nextState;
  updateBackendStatusUI();
}

function updateBackendStatusUI() {
  backendStatus.className = "statusChip";
  pingOut.className = "muted smallText";

  if (backendState === "ok") {
    backendStatus.textContent = t("status.backendAvailable");
    backendStatus.classList.add("statusOk");
    pingOut.textContent = t("tools.pingAvailable");
    return;
  }

  if (backendState === "bad") {
    backendStatus.textContent = t("status.backendNoResponse");
    backendStatus.classList.add("statusErr");
    pingOut.textContent = t("tools.pingNoResponse");
    return;
  }

  if (backendState === "error") {
    backendStatus.textContent = t("status.backendError");
    backendStatus.classList.add("statusErr");
    pingOut.textContent = t("tools.pingError");
    return;
  }

  backendStatus.textContent = t("status.backendChecking");
  backendStatus.classList.add("muted");
  pingOut.textContent = t("tools.pingChecking");
}

function updateTopInfo() {
  roiCountOut.textContent = t("status.rois", { count: rois.length });

  const currentFile = getCurrentFile();
  fileOut.textContent = currentFile
    ? t("status.loadedFile", { name: currentFile.name })
    : t("status.noImageLoaded");

  previewFileName.textContent = currentFile
    ? currentFile.name
    : t("status.noneShort");

  if (selectedFiles.length > 0 && currentFileIndex >= 0) {
    imagePosition.textContent = t("status.imagePosition", {
      current: currentFileIndex + 1,
      total: selectedFiles.length,
    });
  } else {
    imagePosition.textContent = t("status.noImagesLoaded");
  }

  setMode();
  updateControlStates();
}

function getDisplayMetrics() {
  const stageRect = stage.getBoundingClientRect();
  const iw = img.naturalWidth || 0;
  const ih = img.naturalHeight || 0;

  if (!iw || !ih || !stageRect.width || !stageRect.height) {
    return {
      stageRect,
      dispLeft: 0,
      dispTop: 0,
      dispWidth: 0,
      dispHeight: 0,
      scale: 1,
    };
  }

  const scale = Math.min(stageRect.width / iw, stageRect.height / ih);
  const dispWidth = iw * scale;
  const dispHeight = ih * scale;
  const dispLeft = (stageRect.width - dispWidth) / 2;
  const dispTop = (stageRect.height - dispHeight) / 2;

  return {
    stageRect,
    dispLeft,
    dispTop,
    dispWidth,
    dispHeight,
    scale,
  };
}

function clientToImageCoords(clientX, clientY) {
  const m = getDisplayMetrics();
  if (!m.scale) return { x: 0, y: 0 };

  const x = clamp(
    Math.round((clientX - m.stageRect.left - m.dispLeft) / m.scale),
    0,
    img.naturalWidth
  );
  const y = clamp(
    Math.round((clientY - m.stageRect.top - m.dispTop) / m.scale),
    0,
    img.naturalHeight
  );

  return { x, y };
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

function getDominantClass() {
  const counts = {};
  for (let i = 0; i < rois.length; i += 1) {
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

function getMeanScoreValue() {
  const values = [];
  for (let i = 0; i < rois.length; i += 1) {
    const cls = extractClassification(i);
    if (cls && Number.isFinite(cls.score)) values.push(cls.score);
  }
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function formatScore(value) {
  return Number.isFinite(value) ? Number(value).toFixed(3) : "—";
}

function renderSummary() {
  sumRois.textContent = String(rois.length);
  sumClass.textContent = getDominantClass();
  sumScore.textContent = formatScore(getMeanScoreValue());
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderResults() {
  if (!rois.length) {
    currentResultsList.innerHTML = `<div class="emptyBlock muted">${escapeHtml(
      t("results.empty")
    )}</div>`;
    return;
  }

  currentResultsList.innerHTML = rois
    .map((r, idx) => {
      const cls = extractClassification(idx);
      const probs = cls?.probs || {};

      const subtitle = cls
        ? `<div class="resultMeta">${escapeHtml(
            t("results.score", { score: formatScore(cls.score) })
          )}</div>`
        : `<div class="resultMeta">${escapeHtml(
            r.label ? t("results.detection") : t("results.manual")
          )} · ${escapeHtml(t("results.pending"))}</div>`;

      const probsHtml = Object.keys(probs).length
        ? `
          <div class="resultProbTitle">${escapeHtml(t("results.probabilities"))}</div>
          <div class="probList">
            ${Object.entries(probs)
              .map(
                ([k, v]) =>
                  `<span class="probChip">${escapeHtml(k)}: ${formatScore(Number(v))}</span>`
              )
              .join("")}
          </div>
        `
        : "";

      return `
        <article class="resultCard">
          <div class="resultHead">
            <div>
              <div class="resultTitle">ROI ${idx + 1}</div>
              ${subtitle}
            </div>
            <span class="badge">${escapeHtml(
              cls?.label ?? t("results.pending")
            )}</span>
          </div>
          ${probsHtml}
        </article>
      `;
    })
    .join("");
}

function renderRoiList() {
  roiList.innerHTML = "";

  if (!rois.length) {
    roiList.innerHTML = `<div class="muted">${escapeHtml(t("roiList.empty"))}</div>`;
    return;
  }

  rois.forEach((r, idx) => {
    const cls = extractClassification(idx);
    const width = Math.max(0, r.x2 - r.x1);
    const height = Math.max(0, r.y2 - r.y1);

    const item = document.createElement("div");
    item.className = "item";

    const left = document.createElement("div");
    left.className = "itemLeft";

    const top = document.createElement("div");
    top.className = "itemTop";

    const title = document.createElement("strong");
    title.textContent = `ROI ${idx + 1}`;
    top.appendChild(title);

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = cls
      ? `${cls.label} (${formatScore(cls.score)})`
      : r.label || t("roiList.pending");
    top.appendChild(badge);

    const meta = document.createElement("div");
    meta.className = "roiMeta";
    meta.textContent = t("roiList.size", { width, height });

    left.appendChild(top);
    left.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "itemActions";

    const selBtn = document.createElement("button");
    selBtn.textContent =
      selectedIdx === idx ? t("roiList.selected") : t("roiList.select");
    selBtn.onclick = () => {
      selectedIdx = idx;
      saveCurrentImageState();
      draw();
      updateTopInfo();
    };

    const delBtn = document.createElement("button");
    delBtn.textContent = t("roiList.delete");
    delBtn.onclick = () => {
      rois.splice(idx, 1);
      if (selectedIdx === idx) selectedIdx = null;
      if (selectedIdx != null && selectedIdx > idx) selectedIdx -= 1;
      lastResponse = null;
      saveCurrentImageState();
      draw();
      updateTopInfo();
      setMessage(t("messages.roiDeleted"), "info");
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

  const m = getDisplayMetrics();

  const x = m.dispLeft + previewRect.x1 * m.scale;
  const y = m.dispTop + previewRect.y1 * m.scale;
  const w = (previewRect.x2 - previewRect.x1) * m.scale;
  const h = (previewRect.y2 - previewRect.y1) * m.scale;

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
    renderSummary();
    renderResults();
    updateControlStates();
    return;
  }

  const m = getDisplayMetrics();

  rois.forEach((r, idx) => {
    const x = m.dispLeft + r.x1 * m.scale;
    const y = m.dispTop + r.y1 * m.scale;
    const w = (r.x2 - r.x1) * m.scale;
    const h = (r.y2 - r.y1) * m.scale;

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
    const detectionLabel =
      (r.label ? r.label : t("roiList.manual")) +
      (r.score != null ? ` ${formatScore(Number(r.score))}` : "");

    tag.textContent = cls
      ? `#${idx + 1} ${cls.label} (${formatScore(cls.score)})`
      : `#${idx + 1} ${detectionLabel}`;

    el.appendChild(tag);

    if (selectedIdx === idx) {
      ["nw", "ne", "sw", "se"].forEach((name) => {
        const handleEl = document.createElement("div");
        handleEl.className = `handle ${name}`;
        handleEl.dataset.idx = String(idx);
        handleEl.dataset.handle = name;
        el.appendChild(handleEl);
      });
    }

    boxes.appendChild(el);
  });

  drawPreview();
  renderRoiList();
  renderSummary();
  renderResults();
  updateControlStates();
}

function buildHistoryDetail(row) {
  if (!row.details?.length) return t("history.noDetail");
  return row.details
    .map((d) =>
      t("history.detailItem", {
        roi: d.roi,
        label: d.label,
        score: formatScore(d.score),
      })
    )
    .join(" | ");
}

function renderHistory() {
  if (!sessionHistory.length) {
    historyBody.innerHTML = `
      <tr>
        <td colspan="5" class="emptyCell">${escapeHtml(t("history.empty"))}</td>
      </tr>
    `;
    updateControlStates();
    return;
  }

  historyBody.innerHTML = sessionHistory
    .map((row) => {
      return `
        <tr>
          <td>${escapeHtml(row.fileName)}</td>
          <td>${escapeHtml(String(row.roiCount))}</td>
          <td>${escapeHtml(row.dominantClass)}</td>
          <td>${escapeHtml(formatScore(row.meanScoreValue))}</td>
          <td>${escapeHtml(buildHistoryDetail(row))}</td>
        </tr>
      `;
    })
    .join("");

  updateControlStates();
}

function addCurrentResultToHistory() {
  if (!lastResponse?.predictions?.length) return;

  const currentFile = getCurrentFile();
  const fileName = currentFile?.name || t("status.noneShort");

  const details = lastResponse.predictions.map((pred, idx) => {
    const cls = pred?.classification;
    if (!cls) {
      return {
        roi: idx + 1,
        label: t("roiList.pending"),
        score: null,
      };
    }

    return {
      roi: idx + 1,
      label: cls.label ?? t("roiList.pending"),
      score: Number(cls.score ?? 0),
    };
  });

  sessionHistory.push({
    fileName,
    roiCount: rois.length,
    dominantClass: getDominantClass(),
    meanScoreValue: getMeanScoreValue(),
    details,
  });

  renderHistory();
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function exportHistoryCsv() {
  if (!sessionHistory.length) {
    setMessage(t("messages.exportEmpty"), "info");
    return;
  }

  const headers = [
    t("history.headers.file"),
    t("history.headers.rois"),
    t("history.headers.dominantClass"),
    t("history.headers.meanScore"),
    t("history.headers.detail"),
  ];

  const rows = sessionHistory.map((row) => [
    row.fileName,
    row.roiCount,
    row.dominantClass,
    formatScore(row.meanScoreValue),
    buildHistoryDetail(row),
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");
  a.href = url;
  a.download = `irflies_session_history_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  setMessage(t("messages.exportDone"), "ok");
}

function buildExampleOptions() {
  const previousValue = exampleSelect.value;

  exampleSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = t("examples.placeholder");
  exampleSelect.appendChild(placeholder);

  EXAMPLE_FILES.forEach((example) => {
    const option = document.createElement("option");
    option.value = example.fileName;
    option.textContent = t(`examples.${example.key}`);
    exampleSelect.appendChild(option);
  });

  if ([...exampleSelect.options].some((opt) => opt.value === previousValue)) {
    exampleSelect.value = previousValue;
  } else {
    exampleSelect.value = "";
  }
}

function guessMimeType(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpeg") || lower.endsWith(".jpg")) return "image/jpeg";
  return "application/octet-stream";
}

function getExampleLabel(fileName) {
  const example = EXAMPLE_FILES.find((item) => item.fileName === fileName);
  if (!example) return fileName;
  return t(`examples.${example.key}`);
}

function getExamplePath(fileName) {
  return `./examples/${fileName}`;
}

async function pingBackend(showUserMessage = false) {
  try {
    setBackendState("checking");
    const r = await fetch(`${apiBase.value}/health`);
    const j = await r.json();

    if (j.ok) {
      setBackendState("ok");
      if (showUserMessage) setMessage(t("messages.backendOk"), "ok");
    } else {
      setBackendState("bad");
      if (showUserMessage) setMessage(t("messages.backendBad"), "err");
    }
  } catch (_) {
    setBackendState("error");
    if (showUserMessage) setMessage(t("messages.backendUnavailable"), "err");
  }
}

function loadCurrentImage() {
  const currentFile = getCurrentFile();

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }

  if (!currentFile) {
    resetVisualStateOnly();
    img.removeAttribute("src");
    draw();
    updateTopInfo();
    setMessage(t("messages.noImageSelected"), "info");
    return;
  }

  restoreCurrentImageState();

  currentObjectUrl = URL.createObjectURL(currentFile);

  img.onload = () => {
    draw();
    updateTopInfo();

    const state = getCurrentImageState() || emptyImageState();

    if (lastResponse?.predictions?.length) {
      setMessage(
        t("messages.imageReadyClassified", { name: currentFile.name }),
        "ok"
      );
      return;
    }

    if (rois.length) {
      setMessage(
        t("messages.imageReadyWithRois", {
          name: currentFile.name,
          count: rois.length,
        }),
        "info"
      );
      return;
    }

    if (state.detectStatus === "detecting" || autoDetectionRunning) {
      setMessage(
        t("messages.imageDetecting", { name: currentFile.name }),
        "info"
      );
      return;
    }

    if (state.detectError) {
      setMessage(
        t("messages.detectError", {
          name: currentFile.name,
          error: state.detectError,
        }),
        "err"
      );
      return;
    }

    setMessage(
      t("messages.imageReadyNoDetected", { name: currentFile.name }),
      "info"
    );
  };

  img.src = currentObjectUrl;
}

function goToImage(index) {
  if (index < 0 || index >= selectedFiles.length) return;

  saveCurrentImageState();
  currentFileIndex = index;
  loadCurrentImage();
}

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

function normalizeDetectResponse(j, threshold) {
  const arr = j?.rois || j?.boxes || j?.detections || [];
  if (!Array.isArray(arr)) return [];

  return arr
    .map((r) => ({
      x1: Number(r.x1),
      y1: Number(r.y1),
      x2: Number(r.x2),
      y2: Number(r.y2),
      score: r.score != null ? Number(r.score) : null,
      label: r.label ?? "eyes",
    }))
    .filter((r) => r.score == null || r.score >= threshold)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

async function detectFile(file, threshold) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("conf", String(threshold));

  const j = await postForm(`${apiBase.value}/v1/detect/upload`, fd);
  return normalizeDetectResponse(j, threshold);
}

async function autoDetectAllSelectedFiles() {
  if (!selectedFiles.length) return;

  autoDetectionRunning = true;
  setBusy(true);

  const threshold = Number(confIn.value || 0.25);
  let totalRois = 0;
  let failures = 0;

  setMessage(
    t("messages.autoDetectStart", { count: selectedFiles.length }),
    "info"
  );

  for (let i = 0; i < selectedFiles.length; i += 1) {
    const file = selectedFiles[i];

    imageStates[i] = {
      ...(imageStates[i] || emptyImageState()),
      rois: [],
      lastResponse: null,
      selectedIdx: null,
      detectStatus: "detecting",
      detectError: null,
    };

    if (i === currentFileIndex) {
      restoreCurrentImageState();
      draw();
      updateTopInfo();
    }

    setMessage(
      t("messages.autoDetectProgress", {
        current: i + 1,
        total: selectedFiles.length,
        name: file.name,
      }),
      "info"
    );

    try {
      const detectedRois = await detectFile(file, threshold);

      imageStates[i] = {
        ...(imageStates[i] || emptyImageState()),
        rois: detectedRois,
        lastResponse: null,
        selectedIdx: detectedRois.length ? 0 : null,
        detectStatus: "done",
        detectError: null,
      };

      totalRois += detectedRois.length;
    } catch (error) {
      failures += 1;

      imageStates[i] = {
        ...(imageStates[i] || emptyImageState()),
        rois: [],
        lastResponse: null,
        selectedIdx: null,
        detectStatus: "error",
        detectError: String(error),
      };
    }

    if (i === currentFileIndex) {
      restoreCurrentImageState();
      draw();
      updateTopInfo();
    }
  }

  autoDetectionRunning = false;
  setBusy(false);

  restoreCurrentImageState();
  draw();
  updateTopInfo();

  if (failures === 0) {
    setMessage(
      t("messages.autoDetectCompleted", {
        count: selectedFiles.length,
        rois: totalRois,
      }),
      "ok"
    );
  } else {
    setMessage(
      t("messages.autoDetectCompletedWithErrors", {
        count: selectedFiles.length,
        rois: totalRois,
        failures,
      }),
      "info"
    );
  }
}

async function loadFilesIntoSession(files) {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }

  selectedFiles = files;
  imageStates = selectedFiles.map(() => emptyImageState());
  currentFileIndex = selectedFiles.length ? 0 : -1;

  loadCurrentImage();

  if (selectedFiles.length) {
    await autoDetectAllSelectedFiles();
  } else {
    setMessage(t("messages.initial"), "info");
  }
}

async function loadExampleByName(fileName) {
  if (!fileName) return;

  const displayName = getExampleLabel(fileName);

  try {
    setBusy(true);
    setMessage(t("messages.exampleLoading", { name: displayName }), "info");

    const response = await fetch(getExamplePath(fileName), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const exampleFile = new File([blob], fileName, {
      type: blob.type || guessMimeType(fileName),
    });

    fileIn.value = "";
    await loadFilesIntoSession([exampleFile]);
  } catch (error) {
    setBusy(false);
    setMessage(
      t("messages.exampleLoadError", {
        name: displayName,
        error: String(error),
      }),
      "err"
    );
  }
}

function toggleLanguage() {
  currentLang = currentLang === "es" ? "en" : "es";
  localStorage.setItem("irflies_lang", currentLang);
  applyTranslations();
  draw();
  updateTopInfo();
  renderHistory();
}

function applyTranslations() {
  document.documentElement.lang = currentLang;
  document.title = t("page.title");

  $("heroBrand").textContent = t("hero.brand");
  $("heroTitle").textContent = t("hero.title");
  $("heroText").textContent = t("hero.text");

  $("techSummary").textContent = t("tools.summary");
  $("apiBaseLabel").textContent = t("tools.apiBaseLabel");
  pingBtn.textContent = t("tools.ping");

  $("controlsTitle").textContent = t("sections.controls");
  $("confLabel").textContent = t("labels.conf");
  prevImageBtn.textContent =
    currentLang === "es" ? "← Imagen anterior" : "← Previous image";
  nextImageBtn.textContent =
    currentLang === "es" ? "Imagen siguiente →" : "Next image →";

  classifyBtn.textContent = t("buttons.classify");
  openOriginalBtn.textContent = t("buttons.openOriginal");

  $("imageSectionTitle").textContent = t("sections.image");
  $("previewFileLabel").textContent = t("labels.currentFile");
  $("helperText").textContent = t("helper");

  $("examplesTitle").textContent = t("sections.examples");
  $("examplesHint").textContent = t("examples.hint");
  $("exampleSelectLabel").textContent = t("labels.example");
  buildExampleOptions();

  $("summaryTitle").textContent = t("sections.summary");
  $("sumRoisLabel").textContent = t("labels.roisCurrent");
  $("sumClassLabel").textContent = t("labels.dominantClass");
  $("sumScoreLabel").textContent = t("labels.meanScore");
  $("currentResultsTitle").textContent = t("sections.currentResults");
  $("roiPanelTitle").textContent = t("sections.rois");

  $("historyTitle").textContent = t("sections.history");
  clearHistoryBtn.textContent = t("buttons.clearHistory");
  exportCsvBtn.textContent = t("buttons.exportCsv");

  $("historyFileHead").textContent = t("history.headers.file");
  $("historyRoisHead").textContent = t("history.headers.rois");
  $("historyDominantHead").textContent = t("history.headers.dominantClass");
  $("historyMeanHead").textContent = t("history.headers.meanScore");
  $("historyDetailHead").textContent = t("history.headers.detail");

  langToggleBtn.textContent = currentLang === "es" ? "English" : "Español";
  langToggleBtn.title =
    currentLang === "es" ? "Switch to English" : "Cambiar a español";

  updateBackendStatusUI();
  updateTopInfo();
  renderSummary();
  renderResults();
  renderRoiList();
  renderHistory();
}

// --- Archivo ---
fileIn.addEventListener("change", async () => {
  exampleSelect.value = "";
  const files = Array.from(fileIn.files || []);
  await loadFilesIntoSession(files);
});

exampleSelect.addEventListener("change", async () => {
  const selectedExample = exampleSelect.value;
  if (!selectedExample) return;
  await loadExampleByName(selectedExample);
});

prevImageBtn.addEventListener("click", () => {
  if (currentFileIndex > 0) goToImage(currentFileIndex - 1);
});

nextImageBtn.addEventListener("click", () => {
  if (currentFileIndex < selectedFiles.length - 1) {
    goToImage(currentFileIndex + 1);
  }
});

openOriginalBtn.addEventListener("click", () => {
  if (!currentObjectUrl) {
    setMessage(t("messages.openOriginalMissing"), "info");
    return;
  }

  window.open(currentObjectUrl, "_blank", "noopener,noreferrer");
});

clearHistoryBtn.addEventListener("click", () => {
  sessionHistory = [];
  renderHistory();
  setMessage(t("messages.historyCleared"), "info");
});

exportCsvBtn.addEventListener("click", exportHistoryCsv);

pingBtn.addEventListener("click", async () => {
  await pingBackend(true);
});

langToggleBtn.addEventListener("click", toggleLanguage);

// --- Pointer Events ---
stage.style.touchAction = "none";

stage.addEventListener("pointerdown", (e) => {
  if (!img.src || !img.naturalWidth) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;

  const handle = e.target.closest(".handle");
  const box = e.target.closest(".box");

  if (handle) {
    const idx = Number(handle.dataset.idx);
    selectedIdx = idx;

    const roi = rois[idx];
    const { x, y } = clientToImageCoords(e.clientX, e.clientY);

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
    saveCurrentImageState();
    draw();
    updateTopInfo();
    return;
  }

  if (box) {
    const idx = Number(box.dataset.idx);
    selectedIdx = idx;

    const roi = rois[idx];
    const { x, y } = clientToImageCoords(e.clientX, e.clientY);

    pointerState = {
      type: "move",
      idx,
      startX: x,
      startY: y,
      orig: { ...roi },
      pointerId: e.pointerId,
    };

    stage.setPointerCapture(e.pointerId);
    saveCurrentImageState();
    draw();
    updateTopInfo();
    return;
  }

  selectedIdx = null;
  saveCurrentImageState();
  draw();
  updateTopInfo();
});

stage.addEventListener("pointermove", (e) => {
  if (!pointerState) return;

  const { x, y } = clientToImageCoords(e.clientX, e.clientY);

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

  previewRect = null;
  pointerState = null;

  try {
    stage.releasePointerCapture(e.pointerId);
  } catch (_) {}

  saveCurrentImageState();
  draw();
  updateTopInfo();
});

stage.addEventListener("pointercancel", () => {
  pointerState = null;
  previewRect = null;
  saveCurrentImageState();
  draw();
});

// --- Clasificación ---
classifyBtn.addEventListener("click", async () => {
  const f = getCurrentFile();

  if (!f) {
    setMessage(t("messages.noImageSelected"), "info");
    return;
  }

  if (!rois.length) {
    setMessage(t("messages.classifyNoRois"), "info");
    return;
  }

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

    saveCurrentImageState();
    draw();
    updateTopInfo();
    addCurrentResultToHistory();
    setMessage(t("messages.classifyDone"), "ok");
  } catch (error) {
    setMessage(
      t("messages.unexpected", { error: String(error) }),
      "err"
    );
  } finally {
    setBusy(false);
  }
});

window.addEventListener("resize", () => {
  if (img.naturalWidth) draw();
});

// Estado inicial
buildExampleOptions();
applyTranslations();
setMode();
updateTopInfo();
renderSummary();
renderResults();
renderRoiList();
renderHistory();
setMessage(t("messages.initial"), "info");
pingBackend(false);
