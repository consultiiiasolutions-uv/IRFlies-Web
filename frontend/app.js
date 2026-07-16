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

const detectBtn = $("detectBtn");
const classifyBtn = $("classifyBtn");
const addRoiBtn = $("addRoiBtn");
const openOriginalBtn = $("openOriginalBtn");
const clearHistoryBtn = $("clearHistoryBtn");
const exportCsvBtn = $("exportCsvBtn");

const prevImageBtn = $("prevImageBtn");
const nextImageBtn = $("nextImageBtn");
const imagePosition = $("imagePosition");
const autoDetectOnLoad = $("autoDetectOnLoad");

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

const DEFAULT_API_BASE =
  "https://irflies-api-twfkbbgmxa-pv.a.run.app";

apiBase.value = DEFAULT_API_BASE;

const MIN_SIZE = 10;

const EXAMPLE_FILES = [
  { fileName: "ef8_1.jpg", key: "ef8_1" },
  { fileName: "ef8_2.jpg", key: "ef8_2" },
  { fileName: "ef9_1.JPG", key: "ef9_1" },
  { fileName: "ef9_2.JPG", key: "ef9_2" },
];

const STARTUP_EXAMPLE_FILE = "ef8_1.jpg";

let currentLang =
  localStorage.getItem("irflies_lang") || "es";

let rois = [];
let lastResponse = null;
let selectedIdx = null;
let mode = "select";

let pointerState = null;
let previewRect = null;

let selectedFiles = [];
let currentFileIndex = -1;
let currentObjectUrl = null;

let imageStates = [];
let sessionHistory = [];

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
        "Carga una o varias imágenes, detecta hasta seis ojos automáticamente, corrige los ROIs si hace falta y clasifica cada región para estimar la edad fisiológica. El historial se conserva durante toda la sesión.",
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
      detect: "Detectar ojos",
      classify: "Clasificar ROIs",
      addRoi: "Agregar ROI",
      cancelAddRoi: "Cancelar ROI",
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
      autoDetectOnLoad:
        "Detectar automáticamente al cargar",
    },

    modes: {
      select: "seleccionar",
      draw: "agregar ROI",
    },

    helper:
      "Pulsa Agregar ROI y arrastra sobre la imagen para crear una región. Toca un ROI existente para moverlo y usa las esquinas para cambiar su tamaño.",

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
        "Sube una o varias imágenes para comenzar. Puedes detectar hasta seis ojos y después clasificar los ROIs.",

      noImageSelected:
        "No hay imagen seleccionada.",

      backendOk:
        "El backend está disponible.",

      backendBad:
        "El backend respondió, pero no confirmó un estado correcto.",

      backendUnavailable:
        "No se pudo verificar el backend.",

      imageReadyClassified:
        "Imagen cargada: {name}. Ya contiene una clasificación guardada.",

      imageReadyWithRois:
        "Imagen cargada: {name}. Hay {count} ROI(s) listos para revisar o clasificar.",

      imageReadyNoDetected:
        "Imagen cargada: {name}. No hay ROIs todavía; puedes detectar ojos o dibujar uno manualmente.",

      imageDetecting:
        "Imagen cargada: {name}. La detección automática sigue en proceso.",

      detectError:
        "No se pudo detectar automáticamente en {name}: {error}",

      detectCurrentStart:
        "Detectando ojos en la imagen actual: {name}",

      detectCurrentDone:
        "Detección lista para {name}. ROIs detectados: {count}.",

      detectCurrentNoRois:
        "No se detectaron ojos en {name}. Puedes dibujar los ROIs manualmente.",

      roiDeleted:
        "ROI eliminado.",

      roiAdded:
        "ROI manual agregado.",

      historyCleared:
        "Historial de sesión limpiado.",

      classifyDone:
        "Clasificación completada y guardada en el historial de sesión.",

      classifyNoRois:
        "No hay ROIs para clasificar.",

      exportDone:
        "Archivo CSV exportado.",

      exportEmpty:
        "No hay historial para exportar.",

      autoDetectStart:
        "Se inició la detección automática para {count} imagen(es). Se conservarán hasta seis ROIs por imagen.",

      autoDetectProgress:
        "Detectando ojos en {current} de {total}: {name}",

      autoDetectCompleted:
        "Detección automática completada en {count} imagen(es). Total de ROIs: {rois}.",

      autoDetectCompletedWithErrors:
        "La detección automática terminó con incidencias. Imágenes: {count}, ROIs: {rois}, fallas: {failures}.",

      openOriginalMissing:
        "No hay imagen para abrir.",

      unexpected:
        "Ocurrió un error: {error}",

      exampleLoading:
        "Cargando ejemplo: {name}",

      exampleLoadError:
        "No se pudo cargar el ejemplo {name}: {error}",

      addRoiMode:
        "Modo Agregar ROI activo. Arrastra sobre la imagen para dibujar una región.",

      addRoiModeCancelled:
        "Modo Agregar ROI cancelado.",
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
      empty:
        "Todavía no hay resultados para esta imagen.",
      pending:
        "Pendiente de clasificación",
      detection:
        "Detección automática",
      manual:
        "ROI manual",
      score:
        "Score: {score}",
      probabilities:
        "Probabilidades",
    },

    history: {
      empty:
        "Todavía no hay resultados guardados en esta sesión.",

      headers: {
        file: "Archivo",
        rois: "ROIs",
        dominantClass: "Clase dominante",
        meanScore: "Score medio",
        detail: "Detalle",
      },

      detailItem:
        "ROI {roi}: {label} ({score})",

      noDetail:
        "Sin detalle",
    },

    examples: {
      hint:
        "Selecciona un ejemplo y se cargará automáticamente.",

      placeholder:
        "Selecciona un ejemplo...",

      ef8_1:
        "Ejemplo EF8 1",

      ef8_2:
        "Ejemplo EF8 2",

      ef9_1:
        "Ejemplo EF9 1",

      ef9_2:
        "Ejemplo EF9 2",
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
        "Upload one or more images, automatically detect up to six eyes, adjust ROIs if needed, and classify each region to estimate physiological age. Session history is preserved during the whole session.",
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
      detect: "Detect eyes",
      classify: "Classify ROIs",
      addRoi: "Add ROI",
      cancelAddRoi: "Cancel ROI",
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
      autoDetectOnLoad:
        "Detect automatically on load",
    },

    modes: {
      select: "select",
      draw: "add ROI",
    },

    helper:
      "Press Add ROI and drag over the image to create a region. Tap an existing ROI to move it and use the corners to resize it.",

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
        "Upload one or more images to begin. You can detect up to six eyes and then classify the ROIs.",

      noImageSelected:
        "No image selected.",

      backendOk:
        "The backend is available.",

      backendBad:
        "The backend responded, but did not confirm a valid state.",

      backendUnavailable:
        "The backend could not be checked.",

      imageReadyClassified:
        "Image loaded: {name}. A saved classification is already available.",

      imageReadyWithRois:
        "Image loaded: {name}. There are {count} ROI(s) ready to review or classify.",

      imageReadyNoDetected:
        "Image loaded: {name}. There are no ROIs yet; you can detect eyes or draw one manually.",

      imageDetecting:
        "Image loaded: {name}. Automatic detection is still in progress.",

      detectError:
        "Automatic detection failed for {name}: {error}",

      detectCurrentStart:
        "Detecting eyes in the current image: {name}",

      detectCurrentDone:
        "Detection ready for {name}. Detected ROIs: {count}.",

      detectCurrentNoRois:
        "No eyes were detected in {name}. You can draw the ROIs manually.",

      roiDeleted:
        "ROI deleted.",

      roiAdded:
        "Manual ROI added.",

      historyCleared:
        "Session history cleared.",

      classifyDone:
        "Classification completed and saved in session history.",

      classifyNoRois:
        "There are no ROIs to classify.",

      exportDone:
        "CSV file exported.",

      exportEmpty:
        "There is no history to export.",

      autoDetectStart:
        "Automatic detection started for {count} image(s). Up to six ROIs per image will be kept.",

      autoDetectProgress:
        "Detecting eyes in {current} of {total}: {name}",

      autoDetectCompleted:
        "Automatic detection completed for {count} image(s). Total ROIs: {rois}.",

      autoDetectCompletedWithErrors:
        "Automatic detection finished with issues. Images: {count}, ROIs: {rois}, failures: {failures}.",

      openOriginalMissing:
        "There is no image to open.",

      unexpected:
        "An error occurred: {error}",

      exampleLoading:
        "Loading example: {name}",

      exampleLoadError:
        "Could not load example {name}: {error}",

      addRoiMode:
        "Add ROI mode is active. Drag over the image to draw a region.",

      addRoiModeCancelled:
        "Add ROI mode cancelled.",
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
      empty:
        "There are no results for this image yet.",
      pending:
        "Pending classification",
      detection:
        "Automatic detection",
      manual:
        "Manual ROI",
      score:
        "Score: {score}",
      probabilities:
        "Probabilities",
    },

    history: {
      empty:
        "There are no saved results in this session yet.",

      headers: {
        file: "File",
        rois: "ROIs",
        dominantClass: "Dominant class",
        meanScore: "Mean score",
        detail: "Detail",
      },

      detailItem:
        "ROI {roi}: {label} ({score})",

      noDetail:
        "No detail",
    },

    examples: {
      hint:
        "Select an example and it will load automatically.",

      placeholder:
        "Select an example...",

      ef8_1:
        "EF8 example 1",

      ef8_2:
        "EF8 example 2",

      ef9_1:
        "EF9 example 1",

      ef9_2:
        "EF9 example 2",
    },
  },
};

function lookupTranslation(source, key) {
  return key.split(".").reduce((acc, part) => {
    if (
      acc &&
      Object.prototype.hasOwnProperty.call(acc, part)
    ) {
      return acc[part];
    }

    return undefined;
  }, source);
}

function t(key, params = {}) {
  const current =
    lookupTranslation(translations[currentLang], key);

  const fallback =
    lookupTranslation(translations.es, key);

  const template =
    current ?? fallback ?? key;

  return String(template).replace(
    /\{(\w+)\}/g,
    (_, name) => {
      return params[name] != null
        ? String(params[name])
        : `{${name}}`;
    }
  );
}

function clamp(value, minimum, maximum) {
  return Math.max(
    minimum,
    Math.min(maximum, value)
  );
}

function deepClone(object) {
  if (object == null) {
    return object;
  }

  return JSON.parse(JSON.stringify(object));
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
  if (
    currentFileIndex < 0 ||
    currentFileIndex >= selectedFiles.length
  ) {
    return null;
  }

  return selectedFiles[currentFileIndex];
}

function getCurrentImageState() {
  if (
    currentFileIndex < 0 ||
    currentFileIndex >= imageStates.length
  ) {
    return null;
  }

  return imageStates[currentFileIndex];
}

function saveCurrentImageState() {
  if (
    currentFileIndex < 0 ||
    currentFileIndex >= imageStates.length
  ) {
    return;
  }

  const previousState =
    imageStates[currentFileIndex] ||
    emptyImageState();

  imageStates[currentFileIndex] = {
    ...previousState,
    rois: deepClone(rois),
    lastResponse: deepClone(lastResponse),
    selectedIdx,
  };
}

function restoreCurrentImageState() {
  const state =
    getCurrentImageState() ||
    emptyImageState();

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

function clearRoiDerivedValues(roi) {
  if (!roi) {
    return;
  }

  roi.label = null;
  roi.score = null;
}

function syncTranslatedMessage() {
  const currentText =
    msg.textContent.trim();

  const knownMessageKeys = [
    "messages.initial",
    "messages.noImageSelected",
    "messages.backendOk",
    "messages.backendBad",
    "messages.backendUnavailable",
    "messages.classifyNoRois",
    "messages.historyCleared",
    "messages.exportDone",
    "messages.exportEmpty",
    "messages.openOriginalMissing",
    "messages.addRoiMode",
    "messages.addRoiModeCancelled",
  ];

  for (const key of knownMessageKeys) {
    const spanishText =
      lookupTranslation(translations.es, key);

    const englishText =
      lookupTranslation(translations.en, key);

    if (
      currentText === spanishText ||
      currentText === englishText
    ) {
      const type =
        key.includes("Bad") ||
        key.includes("Unavailable")
          ? "err"
          : key.includes("Ok") ||
            key.includes("Done")
          ? "ok"
          : "info";

      setMessage(t(key), type);
      return;
    }
  }
}

function setBusy(value) {
  isBusy = value;
  updateControlStates();
}

function updateControlStates() {
  const currentFile = getCurrentFile();
  const hasImage = Boolean(currentFile);
  const hasRois = rois.length > 0;

  pingBtn.disabled = isBusy;

  detectBtn.disabled =
    isBusy || !hasImage;

  classifyBtn.disabled =
    isBusy || !hasImage || !hasRois;

  addRoiBtn.disabled =
    isBusy || !hasImage;

  openOriginalBtn.disabled =
    isBusy || !hasImage;

  clearHistoryBtn.disabled =
    isBusy || sessionHistory.length === 0;

  exportCsvBtn.disabled =
    isBusy || sessionHistory.length === 0;

  prevImageBtn.disabled =
    isBusy || currentFileIndex <= 0;

  nextImageBtn.disabled =
    isBusy ||
    currentFileIndex < 0 ||
    currentFileIndex >=
      selectedFiles.length - 1;

  fileIn.disabled = isBusy;
  confIn.disabled = isBusy;

  if (exampleSelect) {
    exampleSelect.disabled = isBusy;
  }
}

function setMode(nextMode = mode) {
  mode = nextMode;

  modeOut.textContent = t("status.mode", {
    mode: t(`modes.${mode}`),
  });

  const drawing = mode === "draw";

  addRoiBtn.textContent = drawing
    ? t("buttons.cancelAddRoi")
    : t("buttons.addRoi");

  addRoiBtn.classList.toggle(
    "activeMode",
    drawing
  );
}

function setBackendState(nextState) {
  backendState = nextState;
  updateBackendStatusUI();
}

function updateBackendStatusUI() {
  backendStatus.className = "statusChip";
  pingOut.className = "muted smallText";

  if (backendState === "ok") {
    backendStatus.textContent =
      t("status.backendAvailable");

    backendStatus.classList.add("statusOk");

    pingOut.textContent =
      t("tools.pingAvailable");

    return;
  }

  if (backendState === "bad") {
    backendStatus.textContent =
      t("status.backendNoResponse");

    backendStatus.classList.add("statusErr");

    pingOut.textContent =
      t("tools.pingNoResponse");

    return;
  }

  if (backendState === "error") {
    backendStatus.textContent =
      t("status.backendError");

    backendStatus.classList.add("statusErr");

    pingOut.textContent =
      t("tools.pingError");

    return;
  }

  backendStatus.textContent =
    t("status.backendChecking");

  backendStatus.classList.add("muted");

  pingOut.textContent =
    t("tools.pingChecking");
}

function updateTopInfo() {
  roiCountOut.textContent = t("status.rois", {
    count: rois.length,
  });

  const currentFile = getCurrentFile();

  fileOut.textContent = currentFile
    ? t("status.loadedFile", {
        name: currentFile.name,
      })
    : t("status.noImageLoaded");

  previewFileName.textContent = currentFile
    ? currentFile.name
    : t("status.noneShort");

  if (
    selectedFiles.length > 0 &&
    currentFileIndex >= 0
  ) {
    imagePosition.textContent =
      t("status.imagePosition", {
        current: currentFileIndex + 1,
        total: selectedFiles.length,
      });
  } else {
    imagePosition.textContent =
      t("status.noImagesLoaded");
  }

  setMode();
  updateControlStates();
}

function getDisplayMetrics() {
  const stageRect =
    stage.getBoundingClientRect();

  const imageWidth =
    img.naturalWidth || 0;

  const imageHeight =
    img.naturalHeight || 0;

  if (
    !imageWidth ||
    !imageHeight ||
    !stageRect.width ||
    !stageRect.height
  ) {
    return {
      stageRect,
      dispLeft: 0,
      dispTop: 0,
      dispWidth: 0,
      dispHeight: 0,
      scale: 1,
    };
  }

  const scale = Math.min(
    stageRect.width / imageWidth,
    stageRect.height / imageHeight
  );

  const dispWidth =
    imageWidth * scale;

  const dispHeight =
    imageHeight * scale;

  const dispLeft =
    (stageRect.width - dispWidth) / 2;

  const dispTop =
    (stageRect.height - dispHeight) / 2;

  return {
    stageRect,
    dispLeft,
    dispTop,
    dispWidth,
    dispHeight,
    scale,
  };
}

function isInsideDisplayedImage(
  clientX,
  clientY
) {
  if (
    !img.naturalWidth ||
    !img.naturalHeight
  ) {
    return false;
  }

  const metrics = getDisplayMetrics();

  const localX =
    clientX - metrics.stageRect.left;

  const localY =
    clientY - metrics.stageRect.top;

  return (
    localX >= metrics.dispLeft &&
    localX <=
      metrics.dispLeft +
        metrics.dispWidth &&
    localY >= metrics.dispTop &&
    localY <=
      metrics.dispTop +
        metrics.dispHeight
  );
}

function clientToImageCoords(
  clientX,
  clientY
) {
  const metrics = getDisplayMetrics();

  if (!metrics.scale) {
    return {
      x: 0,
      y: 0,
    };
  }

  const x = clamp(
    Math.round(
      (
        clientX -
        metrics.stageRect.left -
        metrics.dispLeft
      ) / metrics.scale
    ),
    0,
    img.naturalWidth
  );

  const y = clamp(
    Math.round(
      (
        clientY -
        metrics.stageRect.top -
        metrics.dispTop
      ) / metrics.scale
    ),
    0,
    img.naturalHeight
  );

  return {
    x,
    y,
  };
}

function normalizeBox(rectangle) {
  let x1 = Math.min(
    rectangle.x1,
    rectangle.x2
  );

  let y1 = Math.min(
    rectangle.y1,
    rectangle.y2
  );

  let x2 = Math.max(
    rectangle.x1,
    rectangle.x2
  );

  let y2 = Math.max(
    rectangle.y1,
    rectangle.y2
  );

  x1 = clamp(
    Math.round(x1),
    0,
    img.naturalWidth
  );

  y1 = clamp(
    Math.round(y1),
    0,
    img.naturalHeight
  );

  x2 = clamp(
    Math.round(x2),
    0,
    img.naturalWidth
  );

  y2 = clamp(
    Math.round(y2),
    0,
    img.naturalHeight
  );

  if (x2 < x1 + MIN_SIZE) {
    x2 = x1 + MIN_SIZE;
  }

  if (y2 < y1 + MIN_SIZE) {
    y2 = y1 + MIN_SIZE;
  }

  x2 = clamp(
    x2,
    0,
    img.naturalWidth
  );

  y2 = clamp(
    y2,
    0,
    img.naturalHeight
  );

  return {
    x1,
    y1,
    x2,
    y2,
  };
}

function extractClassification(index) {
  const prediction =
    lastResponse?.predictions?.[index];

  if (!prediction) {
    return null;
  }

  const classification =
    prediction.classification ||
    prediction;

  if (!classification) {
    return null;
  }

  return {
    label:
      classification.label ?? "—",

    score:
      Number(classification.score ?? 0),

    probs:
      classification.probs ?? {},
  };
}

function getDominantClass() {
  const counts = {};

  for (
    let index = 0;
    index < rois.length;
    index += 1
  ) {
    const classification =
      extractClassification(index);

    if (!classification?.label) {
      continue;
    }

    counts[classification.label] =
      (counts[classification.label] || 0) + 1;
  }

  let bestLabel = null;
  let bestCount = -1;

  for (
    const [label, count]
    of Object.entries(counts)
  ) {
    if (count > bestCount) {
      bestLabel = label;
      bestCount = count;
    }
  }

  return bestLabel || "—";
}

function getMeanScoreValue() {
  const values = [];

  for (
    let index = 0;
    index < rois.length;
    index += 1
  ) {
    const classification =
      extractClassification(index);

    if (
      classification &&
      Number.isFinite(
        classification.score
      )
    ) {
      values.push(
        classification.score
      );
    }
  }

  if (!values.length) {
    return null;
  }

  return (
    values.reduce(
      (accumulator, value) =>
        accumulator + value,
      0
    ) / values.length
  );
}

function formatScore(value) {
  return Number.isFinite(value)
    ? Number(value).toFixed(3)
    : "—";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSummary() {
  sumRois.textContent =
    String(rois.length);

  sumClass.textContent =
    getDominantClass();

  sumScore.textContent =
    formatScore(getMeanScoreValue());
}

function renderResults() {
  if (!rois.length) {
    currentResultsList.innerHTML = `
      <div class="emptyBlock muted">
        ${escapeHtml(t("results.empty"))}
      </div>
    `;

    return;
  }

  currentResultsList.innerHTML = rois
    .map((roi, index) => {
      const classification =
        extractClassification(index);

      const probabilities =
        classification?.probs || {};

      const subtitle = classification
        ? `
          <div class="resultMeta">
            ${escapeHtml(
              t("results.score", {
                score: formatScore(
                  classification.score
                ),
              })
            )}
          </div>
        `
        : `
          <div class="resultMeta">
            ${escapeHtml(
              roi.label
                ? t("results.detection")
                : t("results.manual")
            )}
            ·
            ${escapeHtml(
              t("results.pending")
            )}
          </div>
        `;

      const probabilitiesHtml =
        Object.keys(probabilities).length
          ? `
            <div class="resultProbTitle">
              ${escapeHtml(
                t("results.probabilities")
              )}
            </div>

            <div class="probList">
              ${Object.entries(probabilities)
                .map(
                  ([label, value]) => `
                    <span class="probChip">
                      ${escapeHtml(label)}:
                      ${formatScore(Number(value))}
                    </span>
                  `
                )
                .join("")}
            </div>
          `
          : "";

      return `
        <article class="resultCard">
          <div class="resultHead">
            <div>
              <div class="resultTitle">
                ROI ${index + 1}
              </div>

              ${subtitle}
            </div>

            <span class="badge">
              ${escapeHtml(
                classification?.label ??
                  t("results.pending")
              )}
            </span>
          </div>

          ${probabilitiesHtml}
        </article>
      `;
    })
    .join("");
}

function renderRoiList() {
  roiList.innerHTML = "";

  if (!rois.length) {
    roiList.innerHTML = `
      <div class="muted">
        ${escapeHtml(t("roiList.empty"))}
      </div>
    `;

    return;
  }

  rois.forEach((roi, index) => {
    const classification =
      extractClassification(index);

    const width = Math.max(
      0,
      roi.x2 - roi.x1
    );

    const height = Math.max(
      0,
      roi.y2 - roi.y1
    );

    const item =
      document.createElement("div");

    item.className = "item";

    const left =
      document.createElement("div");

    left.className = "itemLeft";

    const top =
      document.createElement("div");

    top.className = "itemTop";

    const title =
      document.createElement("strong");

    title.textContent =
      `ROI ${index + 1}`;

    top.appendChild(title);

    const badge =
      document.createElement("span");

    badge.className = "badge";

    badge.textContent = classification
      ? `${classification.label} (${formatScore(
          classification.score
        )})`
      : roi.label ||
        t("roiList.pending");

    top.appendChild(badge);

    const metadata =
      document.createElement("div");

    metadata.className = "roiMeta";

    metadata.textContent = t(
      "roiList.size",
      {
        width,
        height,
      }
    );

    left.appendChild(top);
    left.appendChild(metadata);

    const actions =
      document.createElement("div");

    actions.className = "itemActions";

    const selectButton =
      document.createElement("button");

    selectButton.textContent =
      selectedIdx === index
        ? t("roiList.selected")
        : t("roiList.select");

    selectButton.onclick = () => {
      selectedIdx = index;

      saveCurrentImageState();
      draw();
      updateTopInfo();
    };

    const deleteButton =
      document.createElement("button");

    deleteButton.textContent =
      t("roiList.delete");

    deleteButton.onclick = () => {
      rois.splice(index, 1);

      if (selectedIdx === index) {
        selectedIdx = null;
      }

      if (
        selectedIdx != null &&
        selectedIdx > index
      ) {
        selectedIdx -= 1;
      }

      lastResponse = null;

      saveCurrentImageState();
      draw();
      updateTopInfo();

      setMessage(
        t("messages.roiDeleted"),
        "info"
      );
    };

    actions.appendChild(selectButton);
    actions.appendChild(deleteButton);

    item.appendChild(left);
    item.appendChild(actions);

    roiList.appendChild(item);
  });
}

function drawPreview() {
  if (!previewRect) {
    return;
  }

  const metrics = getDisplayMetrics();

  const x =
    metrics.dispLeft +
    previewRect.x1 * metrics.scale;

  const y =
    metrics.dispTop +
    previewRect.y1 * metrics.scale;

  const width =
    (previewRect.x2 - previewRect.x1) *
    metrics.scale;

  const height =
    (previewRect.y2 - previewRect.y1) *
    metrics.scale;

  const element =
    document.createElement("div");

  element.className = "previewBox";

  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;

  boxes.appendChild(element);
}

function draw() {
  boxes.innerHTML = "";

  if (
    !img.naturalWidth ||
    !img.naturalHeight
  ) {
    renderRoiList();
    renderSummary();
    renderResults();
    updateControlStates();
    return;
  }

  const metrics = getDisplayMetrics();

  rois.forEach((roi, index) => {
    const x =
      metrics.dispLeft +
      roi.x1 * metrics.scale;

    const y =
      metrics.dispTop +
      roi.y1 * metrics.scale;

    const width =
      (roi.x2 - roi.x1) *
      metrics.scale;

    const height =
      (roi.y2 - roi.y1) *
      metrics.scale;

    const element =
      document.createElement("div");

    element.className =
      "box" +
      (
        selectedIdx === index
          ? " selected"
          : ""
      );

    element.dataset.idx =
      String(index);

    element.style.left =
      `${x}px`;

    element.style.top =
      `${y}px`;

    element.style.width =
      `${width}px`;

    element.style.height =
      `${height}px`;

    const tag =
      document.createElement("div");

    tag.className = "tag";

    const classification =
      extractClassification(index);

    const detectionLabel =
      (
        roi.label
          ? roi.label
          : t("roiList.manual")
      ) +
      (
        roi.score != null
          ? ` ${formatScore(
              Number(roi.score)
            )}`
          : ""
      );

    tag.textContent = classification
      ? `#${index + 1} ${classification.label} (${formatScore(
          classification.score
        )})`
      : `#${index + 1} ${detectionLabel}`;

    element.appendChild(tag);

    if (selectedIdx === index) {
      ["nw", "ne", "sw", "se"].forEach(
        (handleName) => {
          const handle =
            document.createElement("div");

          handle.className =
            `handle ${handleName}`;

          handle.dataset.idx =
            String(index);

          handle.dataset.handle =
            handleName;

          element.appendChild(handle);
        }
      );
    }

    boxes.appendChild(element);
  });

  drawPreview();
  renderRoiList();
  renderSummary();
  renderResults();
  updateControlStates();
}

function buildHistoryDetail(row) {
  if (!row.details?.length) {
    return t("history.noDetail");
  }

  return row.details
    .map((detail) =>
      t("history.detailItem", {
        roi: detail.roi,
        label: detail.label,
        score: formatScore(detail.score),
      })
    )
    .join(" | ");
}

function renderHistory() {
  if (!sessionHistory.length) {
    historyBody.innerHTML = `
      <tr>
        <td colspan="5" class="emptyCell">
          ${escapeHtml(t("history.empty"))}
        </td>
      </tr>
    `;

    updateControlStates();
    return;
  }

  historyBody.innerHTML =
    sessionHistory
      .map((row) => `
        <tr>
          <td>
            ${escapeHtml(row.fileName)}
          </td>

          <td>
            ${escapeHtml(
              String(row.roiCount)
            )}
          </td>

          <td>
            ${escapeHtml(
              row.dominantClass
            )}
          </td>

          <td>
            ${escapeHtml(
              formatScore(
                row.meanScoreValue
              )
            )}
          </td>

          <td>
            ${escapeHtml(
              buildHistoryDetail(row)
            )}
          </td>
        </tr>
      `)
      .join("");

  updateControlStates();
}

function addCurrentResultToHistory() {
  if (
    !lastResponse?.predictions?.length
  ) {
    return;
  }

  const currentFile = getCurrentFile();

  const fileName =
    currentFile?.name ||
    t("status.noneShort");

  const details =
    lastResponse.predictions.map(
      (prediction, index) => {
        const classification =
          prediction?.classification;

        if (!classification) {
          return {
            roi: index + 1,
            label: t("roiList.pending"),
            score: null,
          };
        }

        return {
          roi: index + 1,
          label:
            classification.label ??
            t("roiList.pending"),
          score:
            Number(
              classification.score ?? 0
            ),
        };
      }
    );

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
  const text =
    value == null
      ? ""
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function exportHistoryCsv() {
  if (!sessionHistory.length) {
    setMessage(
      t("messages.exportEmpty"),
      "info"
    );

    return;
  }

  const headers = [
    t("history.headers.file"),
    t("history.headers.rois"),
    t("history.headers.dominantClass"),
    t("history.headers.meanScore"),
    t("history.headers.detail"),
  ];

  const rows = sessionHistory.map(
    (row) => [
      row.fileName,
      row.roiCount,
      row.dominantClass,
      formatScore(row.meanScoreValue),
      buildHistoryDetail(row),
    ]
  );

  const csv = [headers, ...rows]
    .map((row) =>
      row.map(csvEscape).join(",")
    )
    .join("\n");

  const blob = new Blob(
    [`\uFEFF${csv}`],
    {
      type: "text/csv;charset=utf-8;",
    }
  );

  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  const timestamp =
    new Date()
      .toISOString()
      .replaceAll(":", "-")
      .replaceAll(".", "-");

  anchor.href = url;

  anchor.download =
    `irflies_session_history_${timestamp}.csv`;

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);

  setMessage(
    t("messages.exportDone"),
    "ok"
  );
}

function buildExampleOptions() {
  if (!exampleSelect) {
    return;
  }

  const previousValue =
    exampleSelect.value;

  exampleSelect.innerHTML = "";

  const placeholder =
    document.createElement("option");

  placeholder.value = "";

  placeholder.textContent =
    t("examples.placeholder");

  exampleSelect.appendChild(
    placeholder
  );

  EXAMPLE_FILES.forEach((example) => {
    const option =
      document.createElement("option");

    option.value = example.fileName;

    option.textContent =
      t(`examples.${example.key}`);

    exampleSelect.appendChild(option);
  });

  const previousValueExists =
    [...exampleSelect.options].some(
      (option) =>
        option.value === previousValue
    );

  exampleSelect.value =
    previousValueExists
      ? previousValue
      : "";
}

function guessMimeType(fileName) {
  const lowerName =
    fileName.toLowerCase();

  if (lowerName.endsWith(".png")) {
    return "image/png";
  }

  if (lowerName.endsWith(".webp")) {
    return "image/webp";
  }

  if (
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".jpg")
  ) {
    return "image/jpeg";
  }

  return "application/octet-stream";
}

function getExampleLabel(fileName) {
  const example =
    EXAMPLE_FILES.find(
      (item) =>
        item.fileName === fileName
    );

  if (!example) {
    return fileName;
  }

  return t(
    `examples.${example.key}`
  );
}

async function pingBackend(
  showUserMessage = false
) {
  try {
    setBackendState("checking");

    const response = await fetch(
      `${apiBase.value}/health`
    );

    const body =
      await response.json();

    if (body.ok) {
      setBackendState("ok");

      if (showUserMessage) {
        setMessage(
          t("messages.backendOk"),
          "ok"
        );
      }

      return;
    }

    setBackendState("bad");

    if (showUserMessage) {
      setMessage(
        t("messages.backendBad"),
        "err"
      );
    }
  } catch (_) {
    setBackendState("error");

    if (showUserMessage) {
      setMessage(
        t("messages.backendUnavailable"),
        "err"
      );
    }
  }
}

function loadCurrentImage() {
  const currentFile = getCurrentFile();

  if (currentObjectUrl) {
    URL.revokeObjectURL(
      currentObjectUrl
    );

    currentObjectUrl = null;
  }

  if (!currentFile) {
    resetVisualStateOnly();

    img.removeAttribute("src");

    draw();
    updateTopInfo();

    setMessage(
      t("messages.noImageSelected"),
      "info"
    );

    return;
  }

  restoreCurrentImageState();

  currentObjectUrl =
    URL.createObjectURL(currentFile);

  img.onload = () => {
    draw();
    updateTopInfo();

    const state =
      getCurrentImageState() ||
      emptyImageState();

    if (
      lastResponse?.predictions?.length
    ) {
      setMessage(
        t(
          "messages.imageReadyClassified",
          {
            name: currentFile.name,
          }
        ),
        "ok"
      );

      return;
    }

    if (rois.length) {
      setMessage(
        t(
          "messages.imageReadyWithRois",
          {
            name: currentFile.name,
            count: rois.length,
          }
        ),
        "info"
      );

      return;
    }

    if (
      state.detectStatus ===
        "detecting" ||
      autoDetectionRunning
    ) {
      setMessage(
        t(
          "messages.imageDetecting",
          {
            name: currentFile.name,
          }
        ),
        "info"
      );

      return;
    }

    if (state.detectError) {
      setMessage(
        t(
          "messages.detectError",
          {
            name: currentFile.name,
            error: state.detectError,
          }
        ),
        "err"
      );

      return;
    }

    setMessage(
      t(
        "messages.imageReadyNoDetected",
        {
          name: currentFile.name,
        }
      ),
      "info"
    );
  };

  img.src = currentObjectUrl;
}

function goToImage(index) {
  if (
    index < 0 ||
    index >= selectedFiles.length
  ) {
    return;
  }

  saveCurrentImageState();

  currentFileIndex = index;

  setMode("select");
  loadCurrentImage();
}

async function postForm(url, formData) {
  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  const text =
    await response.text();

  let body;

  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `Respuesta no JSON: ${text.slice(
        0,
        200
      )}`
    );
  }

  if (!response.ok) {
    throw new Error(
      body?.detail ??
        `HTTP ${response.status}`
    );
  }

  return body;
}

function normalizeDetectResponse(
  body,
  threshold
) {
  const detections =
    body?.rois ||
    body?.boxes ||
    body?.detections ||
    [];

  if (!Array.isArray(detections)) {
    return [];
  }

  return detections
    .map((roi) => ({
      x1: Number(roi.x1),
      y1: Number(roi.y1),
      x2: Number(roi.x2),
      y2: Number(roi.y2),
      score:
        roi.score != null
          ? Number(roi.score)
          : null,
      label:
        roi.label ?? "ojo",
    }))
    .filter(
      (roi) =>
        roi.score == null ||
        roi.score >= threshold
    )
    .sort(
      (first, second) =>
        (second.score ?? -1) -
        (first.score ?? -1)
    );
}

async function detectFile(
  file,
  threshold
) {
  const formData =
    new FormData();

  formData.append("file", file);

  formData.append(
    "conf",
    String(threshold)
  );

  const body = await postForm(
    `${apiBase.value}/v1/detect/upload`,
    formData
  );

  return normalizeDetectResponse(
    body,
    threshold
  );
}

async function detectCurrentImage() {
  const file = getCurrentFile();

  if (
    !file ||
    currentFileIndex < 0
  ) {
    setMessage(
      t("messages.noImageSelected"),
      "info"
    );

    return;
  }

  const threshold = Number(
    confIn.value || 0.25
  );

  setBusy(true);
  setMode("select");

  imageStates[currentFileIndex] = {
    ...(
      imageStates[currentFileIndex] ||
      emptyImageState()
    ),
    rois: [],
    lastResponse: null,
    selectedIdx: null,
    detectStatus: "detecting",
    detectError: null,
  };

  restoreCurrentImageState();

  draw();
  updateTopInfo();

  setMessage(
    t(
      "messages.detectCurrentStart",
      {
        name: file.name,
      }
    ),
    "info"
  );

  try {
    const detectedRois =
      await detectFile(
        file,
        threshold
      );

    imageStates[currentFileIndex] = {
      ...(
        imageStates[currentFileIndex] ||
        emptyImageState()
      ),
      rois: detectedRois,
      lastResponse: null,
      selectedIdx:
        detectedRois.length
          ? 0
          : null,
      detectStatus: "done",
      detectError: null,
    };

    restoreCurrentImageState();

    draw();
    updateTopInfo();

    if (detectedRois.length) {
      setMessage(
        t(
          "messages.detectCurrentDone",
          {
            name: file.name,
            count:
              detectedRois.length,
          }
        ),
        "ok"
      );
    } else {
      setMessage(
        t(
          "messages.detectCurrentNoRois",
          {
            name: file.name,
          }
        ),
        "info"
      );
    }
  } catch (error) {
    imageStates[currentFileIndex] = {
      ...(
        imageStates[currentFileIndex] ||
        emptyImageState()
      ),
      rois: [],
      lastResponse: null,
      selectedIdx: null,
      detectStatus: "error",
      detectError: String(error),
    };

    restoreCurrentImageState();

    draw();
    updateTopInfo();

    setMessage(
      t(
        "messages.detectError",
        {
          name: file.name,
          error: String(error),
        }
      ),
      "err"
    );
  } finally {
    setBusy(false);
  }
}

async function autoDetectAllSelectedFiles() {
  if (!selectedFiles.length) {
    return;
  }

  autoDetectionRunning = true;

  setBusy(true);
  setMode("select");

  const threshold = Number(
    confIn.value || 0.25
  );

  let totalRois = 0;
  let failures = 0;

  setMessage(
    t(
      "messages.autoDetectStart",
      {
        count: selectedFiles.length,
      }
    ),
    "info"
  );

  for (
    let index = 0;
    index < selectedFiles.length;
    index += 1
  ) {
    const file =
      selectedFiles[index];

    imageStates[index] = {
      ...(
        imageStates[index] ||
        emptyImageState()
      ),
      rois: [],
      lastResponse: null,
      selectedIdx: null,
      detectStatus: "detecting",
      detectError: null,
    };

    if (index === currentFileIndex) {
      restoreCurrentImageState();
      draw();
      updateTopInfo();
    }

    setMessage(
      t(
        "messages.autoDetectProgress",
        {
          current: index + 1,
          total:
            selectedFiles.length,
          name: file.name,
        }
      ),
      "info"
    );

    try {
      const detectedRois =
        await detectFile(
          file,
          threshold
        );

      imageStates[index] = {
        ...(
          imageStates[index] ||
          emptyImageState()
        ),
        rois: detectedRois,
        lastResponse: null,
        selectedIdx:
          detectedRois.length
            ? 0
            : null,
        detectStatus: "done",
        detectError: null,
      };

      totalRois +=
        detectedRois.length;
    } catch (error) {
      failures += 1;

      imageStates[index] = {
        ...(
          imageStates[index] ||
          emptyImageState()
        ),
        rois: [],
        lastResponse: null,
        selectedIdx: null,
        detectStatus: "error",
        detectError: String(error),
      };
    }

    if (index === currentFileIndex) {
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
      t(
        "messages.autoDetectCompleted",
        {
          count:
            selectedFiles.length,
          rois: totalRois,
        }
      ),
      "ok"
    );
  } else {
    setMessage(
      t(
        "messages.autoDetectCompletedWithErrors",
        {
          count:
            selectedFiles.length,
          rois: totalRois,
          failures,
        }
      ),
      "info"
    );
  }
}

async function loadFilesIntoSession(
  files
) {
  if (currentObjectUrl) {
    URL.revokeObjectURL(
      currentObjectUrl
    );

    currentObjectUrl = null;
  }

  selectedFiles = files;

  imageStates =
    selectedFiles.map(
      () => emptyImageState()
    );

  currentFileIndex =
    selectedFiles.length
      ? 0
      : -1;

  setMode("select");
  loadCurrentImage();

  if (
    selectedFiles.length &&
    autoDetectOnLoad.checked
  ) {
    await autoDetectAllSelectedFiles();
  } else if (selectedFiles.length) {
    setMessage(
      t(
        "messages.imageReadyNoDetected",
        {
          name:
            selectedFiles[0].name,
        }
      ),
      "info"
    );
  } else {
    setMessage(
      t("messages.initial"),
      "info"
    );
  }
}

async function loadExampleByName(
  fileName
) {
  if (!fileName) {
    return;
  }

  const displayName =
    getExampleLabel(fileName);

  try {
    setMessage(
      t(
        "messages.exampleLoading",
        {
          name: displayName,
        }
      ),
      "info"
    );

    const response = await fetch(
      `./examples/${fileName}`,
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const blob =
      await response.blob();

    const exampleFile = new File(
      [blob],
      fileName,
      {
        type:
          blob.type ||
          guessMimeType(fileName),
      }
    );

    fileIn.value = "";

    await loadFilesIntoSession([
      exampleFile,
    ]);
  } catch (error) {
    setMessage(
      t(
        "messages.exampleLoadError",
        {
          name: displayName,
          error: String(error),
        }
      ),
      "err"
    );
  }
}

function toggleLanguage() {
  currentLang =
    currentLang === "es"
      ? "en"
      : "es";

  localStorage.setItem(
    "irflies_lang",
    currentLang
  );

  applyTranslations();
  draw();
  updateTopInfo();
  renderHistory();
}

function applyTranslations() {
  document.documentElement.lang =
    currentLang;

  document.title =
    t("page.title");

  $("heroBrand").textContent =
    t("hero.brand");

  $("heroTitle").textContent =
    t("hero.title");

  $("heroText").textContent =
    t("hero.text");

  $("techSummary").textContent =
    t("tools.summary");

  $("apiBaseLabel").textContent =
    t("tools.apiBaseLabel");

  pingBtn.textContent =
    t("tools.ping");

  $("controlsTitle").textContent =
    t("sections.controls");

  $("confLabel").textContent =
    t("labels.conf");

  prevImageBtn.textContent =
    currentLang === "es"
      ? "← Imagen anterior"
      : "← Previous image";

  nextImageBtn.textContent =
    currentLang === "es"
      ? "Imagen siguiente →"
      : "Next image →";

  detectBtn.textContent =
    t("buttons.detect");

  classifyBtn.textContent =
    t("buttons.classify");

  openOriginalBtn.textContent =
    t("buttons.openOriginal");

  $("autoDetectOnLoadLabel").textContent =
    t("labels.autoDetectOnLoad");

  $("imageSectionTitle").textContent =
    t("sections.image");

  $("previewFileLabel").textContent =
    t("labels.currentFile");

  $("helperText").textContent =
    t("helper");

  if ($("examplesTitle")) {
    $("examplesTitle").textContent =
      t("sections.examples");
  }

  if ($("examplesHint")) {
    $("examplesHint").textContent =
      t("examples.hint");
  }

  if ($("exampleSelectLabel")) {
    $("exampleSelectLabel").textContent =
      t("labels.example");
  }

  buildExampleOptions();

  $("summaryTitle").textContent =
    t("sections.summary");

  $("sumRoisLabel").textContent =
    t("labels.roisCurrent");

  $("sumClassLabel").textContent =
    t("labels.dominantClass");

  $("sumScoreLabel").textContent =
    t("labels.meanScore");

  $("currentResultsTitle").textContent =
    t("sections.currentResults");

  $("roiPanelTitle").textContent =
    t("sections.rois");

  $("historyTitle").textContent =
    t("sections.history");

  clearHistoryBtn.textContent =
    t("buttons.clearHistory");

  exportCsvBtn.textContent =
    t("buttons.exportCsv");

  $("historyFileHead").textContent =
    t("history.headers.file");

  $("historyRoisHead").textContent =
    t("history.headers.rois");

  $("historyDominantHead").textContent =
    t("history.headers.dominantClass");

  $("historyMeanHead").textContent =
    t("history.headers.meanScore");

  $("historyDetailHead").textContent =
    t("history.headers.detail");

  langToggleBtn.textContent =
    currentLang === "es"
      ? "English"
      : "Español";

  langToggleBtn.title =
    currentLang === "es"
      ? "Switch to English"
      : "Cambiar a español";

  updateBackendStatusUI();
  updateTopInfo();
  renderSummary();
  renderResults();
  renderRoiList();
  renderHistory();
  syncTranslatedMessage();
}

fileIn.addEventListener(
  "change",
  async () => {
    if (exampleSelect) {
      exampleSelect.value = "";
    }

    const files =
      Array.from(
        fileIn.files || []
      );

    await loadFilesIntoSession(files);
  }
);

if (exampleSelect) {
  exampleSelect.addEventListener(
    "change",
    async () => {
      const selectedExample =
        exampleSelect.value;

      if (!selectedExample) {
        return;
      }

      await loadExampleByName(
        selectedExample
      );
    }
  );
}

prevImageBtn.addEventListener(
  "click",
  () => {
    if (currentFileIndex > 0) {
      goToImage(
        currentFileIndex - 1
      );
    }
  }
);

nextImageBtn.addEventListener(
  "click",
  () => {
    if (
      currentFileIndex <
      selectedFiles.length - 1
    ) {
      goToImage(
        currentFileIndex + 1
      );
    }
  }
);

openOriginalBtn.addEventListener(
  "click",
  () => {
    if (!currentObjectUrl) {
      setMessage(
        t(
          "messages.openOriginalMissing"
        ),
        "info"
      );

      return;
    }

    window.open(
      currentObjectUrl,
      "_blank",
      "noopener,noreferrer"
    );
  }
);

clearHistoryBtn.addEventListener(
  "click",
  () => {
    sessionHistory = [];

    renderHistory();

    setMessage(
      t("messages.historyCleared"),
      "info"
    );
  }
);

exportCsvBtn.addEventListener(
  "click",
  exportHistoryCsv
);

pingBtn.addEventListener(
  "click",
  async () => {
    await pingBackend(true);
  }
);

langToggleBtn.addEventListener(
  "click",
  toggleLanguage
);

detectBtn.addEventListener(
  "click",
  async () => {
    pointerState = null;
    previewRect = null;

    setMode("select");

    await detectCurrentImage();
  }
);

addRoiBtn.addEventListener(
  "click",
  () => {
    if (!getCurrentFile()) {
      setMessage(
        t(
          "messages.noImageSelected"
        ),
        "info"
      );

      return;
    }

    const activateDrawing =
      mode !== "draw";

    pointerState = null;
    previewRect = null;
    selectedIdx = null;

    setMode(
      activateDrawing
        ? "draw"
        : "select"
    );

    draw();
    updateTopInfo();

    setMessage(
      t(
        activateDrawing
          ? "messages.addRoiMode"
          : "messages.addRoiModeCancelled"
      ),
      "info"
    );
  }
);

stage.style.touchAction = "none";

stage.addEventListener(
  "pointerdown",
  (event) => {
    if (
      !img.src ||
      !img.naturalWidth
    ) {
      return;
    }

    if (
      event.pointerType === "mouse" &&
      event.button !== 0
    ) {
      return;
    }

    const handle =
      event.target.closest(".handle");

    const box =
      event.target.closest(".box");

    const insideImage =
      isInsideDisplayedImage(
        event.clientX,
        event.clientY
      );

    const { x, y } =
      clientToImageCoords(
        event.clientX,
        event.clientY
      );

    if (mode === "draw") {
      if (!insideImage) {
        return;
      }

      event.preventDefault();

      selectedIdx = null;

      pointerState = {
        type: "draw",
        startX: x,
        startY: y,
        pointerId: event.pointerId,
      };

      previewRect = {
        x1: x,
        y1: y,
        x2: x,
        y2: y,
      };

      stage.setPointerCapture(
        event.pointerId
      );

      draw();
      updateTopInfo();
      return;
    }

    if (handle) {
      const index =
        Number(handle.dataset.idx);

      selectedIdx = index;

      const roi = rois[index];

      pointerState = {
        type: "resize",
        idx: index,
        handle:
          handle.dataset.handle,
        startX: x,
        startY: y,
        orig: { ...roi },
        pointerId: event.pointerId,
      };

      stage.setPointerCapture(
        event.pointerId
      );

      saveCurrentImageState();
      draw();
      updateTopInfo();
      return;
    }

    if (box) {
      const index =
        Number(box.dataset.idx);

      selectedIdx = index;

      const roi = rois[index];

      pointerState = {
        type: "move",
        idx: index,
        startX: x,
        startY: y,
        orig: { ...roi },
        pointerId: event.pointerId,
      };

      stage.setPointerCapture(
        event.pointerId
      );

      saveCurrentImageState();
      draw();
      updateTopInfo();
      return;
    }

    selectedIdx = null;

    saveCurrentImageState();
    draw();
    updateTopInfo();
  }
);

stage.addEventListener(
  "pointermove",
  (event) => {
    if (!pointerState) {
      return;
    }

    const { x, y } =
      clientToImageCoords(
        event.clientX,
        event.clientY
      );

    if (
      pointerState.type === "draw"
    ) {
      previewRect = normalizeBox({
        x1: pointerState.startX,
        y1: pointerState.startY,
        x2: x,
        y2: y,
      });

      draw();
      return;
    }

    if (
      pointerState.type === "move"
    ) {
      const roi =
        rois[pointerState.idx];

      if (!roi) {
        return;
      }

      const deltaX =
        x - pointerState.startX;

      const deltaY =
        y - pointerState.startY;

      const width =
        pointerState.orig.x2 -
        pointerState.orig.x1;

      const height =
        pointerState.orig.y2 -
        pointerState.orig.y1;

      let newX1 =
        pointerState.orig.x1 +
        deltaX;

      let newY1 =
        pointerState.orig.y1 +
        deltaY;

      newX1 = clamp(
        newX1,
        0,
        img.naturalWidth - width
      );

      newY1 = clamp(
        newY1,
        0,
        img.naturalHeight - height
      );

      roi.x1 = Math.round(newX1);
      roi.y1 = Math.round(newY1);

      roi.x2 = Math.round(
        newX1 + width
      );

      roi.y2 = Math.round(
        newY1 + height
      );

      clearRoiDerivedValues(roi);

      lastResponse = null;

      draw();
      return;
    }

    if (
      pointerState.type === "resize"
    ) {
      const roi =
        rois[pointerState.idx];

      if (!roi) {
        return;
      }

      let nextRectangle = {
        ...pointerState.orig,
      };

      if (
        pointerState.handle.includes("n")
      ) {
        nextRectangle.y1 = y;
      }

      if (
        pointerState.handle.includes("s")
      ) {
        nextRectangle.y2 = y;
      }

      if (
        pointerState.handle.includes("w")
      ) {
        nextRectangle.x1 = x;
      }

      if (
        pointerState.handle.includes("e")
      ) {
        nextRectangle.x2 = x;
      }

      nextRectangle =
        normalizeBox(nextRectangle);

      roi.x1 = nextRectangle.x1;
      roi.y1 = nextRectangle.y1;
      roi.x2 = nextRectangle.x2;
      roi.y2 = nextRectangle.y2;

      clearRoiDerivedValues(roi);

      lastResponse = null;

      draw();
    }
  }
);

stage.addEventListener(
  "pointerup",
  (event) => {
    if (!pointerState) {
      return;
    }

    if (
      pointerState.type === "draw" &&
      previewRect
    ) {
      const validWidth =
        previewRect.x2 >
        previewRect.x1 + 2;

      const validHeight =
        previewRect.y2 >
        previewRect.y1 + 2;

      if (
        validWidth &&
        validHeight
      ) {
        rois.push({
          x1: previewRect.x1,
          y1: previewRect.y1,
          x2: previewRect.x2,
          y2: previewRect.y2,
          score: null,
          label: null,
        });

        selectedIdx =
          rois.length - 1;

        lastResponse = null;

        setMessage(
          t("messages.roiAdded"),
          "ok"
        );

        setMode("select");
      }
    }

    previewRect = null;
    pointerState = null;

    try {
      stage.releasePointerCapture(
        event.pointerId
      );
    } catch (_) {
      // El puntero ya fue liberado.
    }

    saveCurrentImageState();
    draw();
    updateTopInfo();
  }
);

stage.addEventListener(
  "pointercancel",
  () => {
    pointerState = null;
    previewRect = null;

    saveCurrentImageState();
    draw();
    updateTopInfo();
  }
);

classifyBtn.addEventListener(
  "click",
  async () => {
    const file = getCurrentFile();

    if (!file) {
      setMessage(
        t(
          "messages.noImageSelected"
        ),
        "info"
      );

      return;
    }

    if (!rois.length) {
      setMessage(
        t(
          "messages.classifyNoRois"
        ),
        "info"
      );

      return;
    }

    setBusy(true);
    setMode("select");

    try {
      const formData =
        new FormData();

      formData.append(
        "file",
        file
      );

      formData.append(
        "conf",
        String(
          Number(
            confIn.value || 0.25
          )
        )
      );

      formData.append(
        "rois_json",
        JSON.stringify(
          rois.map((roi) => ({
            x1: roi.x1,
            y1: roi.y1,
            x2: roi.x2,
            y2: roi.y2,
          }))
        )
      );

      const body =
        await postForm(
          `${apiBase.value}/v1/pipeline/upload`,
          formData
        );

      lastResponse = body;

      saveCurrentImageState();
      draw();
      updateTopInfo();
      addCurrentResultToHistory();

      setMessage(
        t(
          "messages.classifyDone"
        ),
        "ok"
      );
    } catch (error) {
      setMessage(
        t(
          "messages.unexpected",
          {
            error: String(error),
          }
        ),
        "err"
      );
    } finally {
      setBusy(false);
    }
  }
);

window.addEventListener(
  "resize",
  () => {
    if (img.naturalWidth) {
      draw();
    }
  }
);

async function initializeApp() {
  buildExampleOptions();
  applyTranslations();
  setMode("select");
  updateTopInfo();
  renderSummary();
  renderResults();
  renderRoiList();
  renderHistory();

  setMessage(
    t("messages.initial"),
    "info"
  );

  pingBackend(false);

  if (exampleSelect) {
    exampleSelect.value =
      STARTUP_EXAMPLE_FILE;

    await loadExampleByName(
      STARTUP_EXAMPLE_FILE
    );
  }
}

initializeApp();
