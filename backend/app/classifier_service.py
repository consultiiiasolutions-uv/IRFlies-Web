# backend/app/classifier_service.py
import io
import os
import json
import logging
import zipfile
import hashlib
import tempfile
import threading
from typing import Dict, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageOps
from tensorflow.keras.applications.efficientnet_v2 import preprocess_input as preprocess_enetv2
from google.cloud import storage
import tensorflow as tf

from .config import settings
from .schemas import ClassifyResponse

log = logging.getLogger("irflies.classifier")

_MODEL: Optional[tf.keras.Model] = None
_MODEL_HW: Optional[Tuple[int, int]] = None  # (H, W)
_LABELS: Optional[List[str]] = None
_MODEL_LOCK = threading.Lock()
_GCS: Optional[storage.Client] = None


def _get_gcs_client() -> storage.Client:
    global _GCS
    if _GCS is None:
        _GCS = storage.Client()
    return _GCS


def _parse_gcs_uri(uri: str) -> Tuple[str, str]:
    if not uri.startswith("gs://"):
        raise ValueError(f"gcs_uri inválida: {uri}")
    no_scheme = uri[len("gs://"):]
    parts = no_scheme.split("/", 1)
    bucket = parts[0]
    blob = parts[1] if len(parts) > 1 else ""
    if not bucket or not blob:
        raise ValueError(f"gcs_uri inválida: {uri}")
    return bucket, blob


def _model_ext(model_uri: str) -> str:
    lower = model_uri.lower().split("?", 1)[0]
    if lower.endswith(".hdf5"):
        return ".hdf5"
    if lower.endswith(".h5"):
        return ".h5"
    if lower.endswith(".keras"):
        return ".keras"
    return ".h5"


def _load_labels_from_env() -> Optional[List[str]]:
    csv = (settings.classifier_labels_csv or os.getenv("IRFLIES_CLASSIFIER_LABELS_CSV", "")).strip()
    if csv:
        return [x.strip() for x in csv.split(",") if x.strip()]

    js = (settings.classifier_labels_json or os.getenv("IRFLIES_CLASSIFIER_LABELS_JSON", "")).strip()
    if js:
        try:
            arr = json.loads(js)
            if isinstance(arr, list) and all(isinstance(x, str) for x in arr):
                return arr
        except Exception:
            log.exception("No pude parsear IRFLIES_CLASSIFIER_LABELS_JSON")

    return None


def _cache_path_for_uri(model_uri: str, generation: Optional[str] = None) -> str:
    # Cache determinista por URI + generación. Si se sobrescribe el modelo en GCS, cambia la generación.
    key = model_uri if generation is None else f"{model_uri}#generation={generation}"
    h = hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]
    base_dir = "/tmp/irflies_models"
    os.makedirs(base_dir, exist_ok=True)
    return os.path.join(base_dir, f"classifier_{h}{_model_ext(model_uri)}")


def _validate_model_file(path: str, expected_size: Optional[int] = None) -> None:
    if not os.path.exists(path):
        raise RuntimeError(f"Modelo no existe en {path}")

    size = os.path.getsize(path)
    if size <= 0:
        raise RuntimeError(f"Modelo vacío en {path}")

    if expected_size is not None and size != expected_size:
        raise RuntimeError(f"Tamaño incorrecto: local={size} bytes, esperado={expected_size} bytes, path={path}")

    lower = path.lower()
    if lower.endswith((".h5", ".hdf5")):
        log.info("[classifier] h5_ok path=%s size_bytes=%d expected=%s", path, size, expected_size)
        return

    if lower.endswith(".keras"):
        if not zipfile.is_zipfile(path):
            raise RuntimeError(f"El archivo no parece .keras (zip). path={path}")
        with zipfile.ZipFile(path, "r") as z:
            names = set(z.namelist())
            required = {"metadata.json", "config.json", "model.weights.h5"}
            missing = required.difference(names)
            if missing:
                raise RuntimeError(f".keras inválido, faltan entradas {sorted(missing)}. path={path}")
            bad = z.testzip()
            if bad is not None:
                raise RuntimeError(f".keras corrupto: entrada dañada '{bad}'. path={path}")
        log.info("[classifier] keras_ok path=%s size_bytes=%d expected=%s", path, size, expected_size)
        return

    log.warning("Extensión no reconocida para modelo %s. load_model hará la validación final.", path)


def _download_blob_to_path(blob, model_uri: str, local_path: str, expected_size: Optional[int]) -> None:
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    suffix = _model_ext(model_uri)

    with tempfile.NamedTemporaryFile(prefix="dl_classifier_", suffix=suffix, dir=os.path.dirname(local_path), delete=False) as tmp:
        tmp_path = tmp.name

    try:
        log.info("Descargando modelo: %s -> %s (expected_size=%s generation=%s)", model_uri, tmp_path, expected_size, getattr(blob, "generation", None))
        blob.download_to_filename(tmp_path)
        _validate_model_file(tmp_path, expected_size=expected_size)
        os.replace(tmp_path, local_path)
        log.info("Modelo cacheado en: %s", local_path)
    except Exception:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass
        raise


def _ensure_model_local_path(model_uri: str) -> str:
    if not model_uri.startswith("gs://"):
        if not os.path.exists(model_uri) or os.path.getsize(model_uri) <= 0:
            raise RuntimeError(f"Modelo local inválido: {model_uri}")
        _validate_model_file(model_uri, expected_size=None)
        return model_uri

    bucket_name, blob_name = _parse_gcs_uri(model_uri)
    client = _get_gcs_client()
    blob = client.bucket(bucket_name).blob(blob_name)
    blob.reload()

    expected_size = int(blob.size) if blob.size is not None else None
    generation = str(blob.generation) if blob.generation is not None else None
    local_path = _cache_path_for_uri(model_uri, generation=generation)

    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        try:
            _validate_model_file(local_path, expected_size=expected_size)
            return local_path
        except Exception as e:
            log.warning("Cache de clasificador inválido, se redescarga. reason=%s", e)
            try:
                os.remove(local_path)
            except Exception:
                pass

    _download_blob_to_path(blob, model_uri, local_path, expected_size=expected_size)
    return local_path


def _infer_hw(model: tf.keras.Model) -> Tuple[int, int]:
    inp = model.input_shape
    if isinstance(inp, list):
        inp = inp[0]
    if not (isinstance(inp, tuple) and len(inp) >= 3):
        raise RuntimeError(f"input_shape inesperado: {inp}")
    h = int(inp[1])
    w = int(inp[2])
    if h <= 0 or w <= 0:
        raise RuntimeError(f"input_hw inválido: {(h, w)}")
    return (h, w)


def _load_model_if_needed() -> Tuple[tf.keras.Model, Tuple[int, int], Optional[List[str]]]:
    global _MODEL, _MODEL_HW, _LABELS

    if _MODEL is not None and _MODEL_HW is not None:
        return _MODEL, _MODEL_HW, _LABELS

    with _MODEL_LOCK:
        if _MODEL is not None and _MODEL_HW is not None:
            return _MODEL, _MODEL_HW, _LABELS

        model_uri = (settings.classifier_model_uri or os.getenv("IRFLIES_CLASSIFIER_MODEL_URI", "")).strip()
        if not model_uri:
            raise RuntimeError("Falta IRFLIES_CLASSIFIER_MODEL_URI (gs://.../modelo.h5 o .keras)")

        local_path = _ensure_model_local_path(model_uri)
        log.info("Cargando modelo Keras desde: %s (tf=%s)", local_path, tf.__version__)

        try:
            _MODEL = tf.keras.models.load_model(local_path, compile=False)
        except Exception as e:
            log.exception("load_model falló, borrar cache y reintentar 1 vez. err=%s", e)
            try:
                if model_uri.startswith("gs://") and os.path.exists(local_path):
                    os.remove(local_path)
            except Exception:
                pass
            local_path = _ensure_model_local_path(model_uri)
            _MODEL = tf.keras.models.load_model(local_path, compile=False)

        _MODEL_HW = _infer_hw(_MODEL)
        _LABELS = _load_labels_from_env()
        log.info(
            "Modelo cargado OK. input_hw=%s labels=%s preprocess=%s output_mode=%s",
            _MODEL_HW,
            _LABELS,
            settings.classifier_preprocess,
            settings.classifier_output_mode,
        )
        return _MODEL, _MODEL_HW, _LABELS


def _softmax_np(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=np.float32)
    x = np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0)
    x = x - np.max(x, axis=-1, keepdims=True)
    ex = np.exp(x)
    den = np.sum(ex, axis=-1, keepdims=True)
    den = np.where(den == 0, 1.0, den)
    return ex / den


def _as_probabilities(row: np.ndarray) -> np.ndarray:
    row = np.asarray(row, dtype=np.float32).ravel()
    row = np.nan_to_num(row, nan=0.0, posinf=0.0, neginf=0.0)
    mode = (settings.classifier_output_mode or "auto").strip().lower()

    if mode == "softmax":
        return _softmax_np(row).astype(np.float32)

    if mode in {"prob", "probs", "probability", "probabilities"}:
        row = np.clip(row, 0.0, 1.0)
        s = float(row.sum())
        return (row / s).astype(np.float32) if s > 0 else _softmax_np(row).astype(np.float32)

    if mode == "raw":
        return row.astype(np.float32)

    # auto: si parece una distribución, se respeta; si no, se aplica softmax.
    s = float(row.sum())
    if row.size > 1 and np.all(row >= 0.0) and np.all(row <= 1.0) and 0.98 <= s <= 1.02:
        return row.astype(np.float32)
    return _softmax_np(row).astype(np.float32)


def _preprocess_pil(img: Image.Image, hw: Tuple[int, int]) -> np.ndarray:
    h, w = hw
    img = ImageOps.exif_transpose(img).convert("RGB")
    img = img.resize((w, h), Image.Resampling.BILINEAR)
    arr = np.asarray(img, dtype=np.float32)

    mode = (settings.classifier_preprocess or "efficientnetv2").strip().lower()
    if mode in {"efficientnetv2", "efficientnet_v2", "enetv2"}:
        arr = preprocess_enetv2(arr)
    elif mode in {"scale_0_1", "rescale_0_1", "0_1", "divide_255"}:
        arr = arr / 255.0
    elif mode in {"none", "raw", "0_255"}:
        pass
    else:
        raise RuntimeError(f"IRFLIES_CLASSIFIER_PREPROCESS inválido: {settings.classifier_preprocess}")

    return arr.astype(np.float32)


def _preprocess(image_bytes: bytes, hw: Tuple[int, int]) -> np.ndarray:
    img = Image.open(io.BytesIO(image_bytes))
    arr = _preprocess_pil(img, hw)
    return np.expand_dims(arr, axis=0)


def _name_for_idx(labels: Optional[List[str]], i: int) -> str:
    if labels and 0 <= i < len(labels):
        return labels[i]
    return str(i)


def _response_from_row(row: np.ndarray, labels: Optional[List[str]]) -> ClassifyResponse:
    row = np.asarray(row, dtype=np.float32).ravel()

    if row.size > 1:
        vec = _as_probabilities(row)
        idx = int(np.argmax(vec))
        score = float(vec[idx])
        probs: Dict[str, float] = {_name_for_idx(labels, i): float(vec[i]) for i in range(vec.size)}
        return ClassifyResponse(label=_name_for_idx(labels, idx), score=score, probs=probs)

    val = float(row[0]) if row.size == 1 else 0.0
    return ClassifyResponse(label="value", score=val, probs={})


def classify_image(image_bytes: bytes) -> ClassifyResponse:
    if not settings.classifier_enabled:
        return ClassifyResponse(label="not_configured", score=0.0, probs={})

    model, hw, labels = _load_model_if_needed()
    x = _preprocess(image_bytes, hw)
    pred = model(x, training=False)

    if isinstance(pred, list):
        pred = pred[0]
    pred = np.asarray(pred.numpy() if hasattr(pred, "numpy") else pred)

    if pred.ndim == 2 and pred.shape[0] == 1:
        pred = pred[0]

    return _response_from_row(pred, labels)


def classify_crops_batch(crops_rgb: List[Image.Image]) -> List[ClassifyResponse]:
    if not settings.classifier_enabled:
        return [ClassifyResponse(label="not_configured", score=0.0, probs={}) for _ in crops_rgb]

    if not crops_rgb:
        return []

    model, hw, labels = _load_model_if_needed()
    x = np.stack([_preprocess_pil(img, hw) for img in crops_rgb], axis=0).astype(np.float32)
    pred = model(x, training=False)

    if isinstance(pred, list):
        pred = pred[0]
    pred = np.asarray(pred.numpy() if hasattr(pred, "numpy") else pred)

    if pred.ndim == 1:
        pred = pred.reshape(1, -1) if len(crops_rgb) == 1 else pred.reshape(len(crops_rgb), -1)

    out: List[ClassifyResponse] = []
    for row in pred:
        out.append(_response_from_row(row, labels))
    return out
