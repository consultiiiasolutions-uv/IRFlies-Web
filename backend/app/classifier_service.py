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
from PIL import Image
from google.cloud import storage
import tensorflow as tf

from .config import settings
from .schemas import ClassifyResponse

log = logging.getLogger("irflies.classifier")

_MODEL: Optional[tf.keras.Model] = None
_MODEL_HW: Optional[Tuple[int, int]] = None  # (H, W)
_LABELS: Optional[List[str]] = None
_GCS: Optional[storage.Client] = None

_MODEL_LOCK = threading.Lock()


def _get_gcs_client() -> storage.Client:
    global _GCS
    if _GCS is None:
        _GCS = storage.Client()
    return _GCS


def _parse_gcs_uri(uri: str) -> Tuple[str, str]:
    # gs://bucket/path/to/object
    if not uri.startswith("gs://"):
        raise ValueError(f"gcs_uri inválida: {uri}")
    no_scheme = uri[len("gs://"):]
    parts = no_scheme.split("/", 1)
    bucket = parts[0]
    blob = parts[1] if len(parts) > 1 else ""
    if not bucket or not blob:
        raise ValueError(f"gcs_uri inválida: {uri}")
    return bucket, blob


def _load_labels_from_env() -> Optional[List[str]]:
    """
    Opcional:
      - IRFLIES_CLASSIFIER_LABELS_CSV="A,B,C"
      - IRFLIES_CLASSIFIER_LABELS_JSON='["A","B","C"]'
    """
    csv = os.getenv("IRFLIES_CLASSIFIER_LABELS_CSV", "").strip()
    if csv:
        return [x.strip() for x in csv.split(",") if x.strip()]

    js = os.getenv("IRFLIES_CLASSIFIER_LABELS_JSON", "").strip()
    if js:
        try:
            arr = json.loads(js)
            if isinstance(arr, list) and all(isinstance(x, str) for x in arr):
                return arr
        except Exception:
            log.exception("No pude parsear IRFLIES_CLASSIFIER_LABELS_JSON")

    return None


def _cache_path_for_uri(model_uri: str) -> str:
    # cache determinista para evitar choques
    h = hashlib.sha256(model_uri.encode("utf-8")).hexdigest()[:16]
    base_dir = "/tmp/irflies_models"
    os.makedirs(base_dir, exist_ok=True)

    # respeta extensión del modelo remoto
    ext = ".h5" if model_uri.lower().endswith(".h5") else ".keras"
    return os.path.join(base_dir, f"model_{h}{ext}")


def _validate_model_file(path: str, expected_size: Optional[int] = None) -> None:
    """
    Validación para:
      - .keras: zip con metadata/config/weights
      - .h5: solo tamaño/existencia (load_model valida internamente)
    """
    if not os.path.exists(path):
        raise RuntimeError(f"Modelo no existe en {path}")

    size = os.path.getsize(path)
    if size <= 0:
        raise RuntimeError(f"Modelo vacío en {path}")

    if expected_size is not None and size != expected_size:
        raise RuntimeError(
            f"Tamaño incorrecto: local={size} bytes, esperado={expected_size} bytes, path={path}"
        )

    # Si es .h5: no es zip, basta con tamaño/existencia
    if path.lower().endswith(".h5"):
        log.info("[classifier] h5_ok path=%s size_bytes=%d expected=%s", path, size, expected_size)
        return

    # Si no es .h5, asumimos .keras
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

        wsize = z.getinfo("model.weights.h5").file_size
        if wsize <= 0:
            raise RuntimeError(f"model.weights.h5 viene vacío dentro del .keras. path={path}")

    log.info("[classifier] keras_ok path=%s size_bytes=%d expected=%s", path, size, expected_size)


def _download_gcs_to_path(model_uri: str, local_path: str) -> None:
    bucket_name, blob_name = _parse_gcs_uri(model_uri)
    client = _get_gcs_client()

    blob = client.bucket(bucket_name).blob(blob_name)
    blob.reload()  # para obtener size actualizado
    expected_size = int(blob.size) if blob.size is not None else None

    os.makedirs(os.path.dirname(local_path), exist_ok=True)

    # suffix de tmp acorde a extensión
    suffix = ".h5" if local_path.lower().endswith(".h5") else ".keras"

    # Descarga atómica: primero a tmp, valida, luego rename.
    with tempfile.NamedTemporaryFile(
        prefix="dl_", suffix=suffix, dir=os.path.dirname(local_path), delete=False
    ) as tmp:
        tmp_path = tmp.name

    try:
        log.info("Descargando modelo: %s -> %s (expected_size=%s)", model_uri, tmp_path, expected_size)
        blob.download_to_filename(tmp_path)

        _validate_model_file(tmp_path, expected_size=expected_size)

        os.replace(tmp_path, local_path)  # atómico
        log.info("Modelo cacheado en: %s", local_path)
    except Exception:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass
        raise


def _ensure_model_local_path(model_uri: str) -> str:
    """
    Descarga el modelo desde GCS a /tmp si hace falta (y valida).
    """
    if not model_uri.startswith("gs://"):
        if not os.path.exists(model_uri) or os.path.getsize(model_uri) <= 0:
            raise RuntimeError(f"Modelo local inválido: {model_uri}")
        return model_uri

    local_path = _cache_path_for_uri(model_uri)

    # Si existe, valida; si está mal, bórralo y re-descarga
    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        try:
            _validate_model_file(local_path, expected_size=None)
            return local_path
        except Exception as e:
            log.warning("Cache inválido, re-descargando. reason=%s", e)
            try:
                os.remove(local_path)
            except Exception:
                pass

    _download_gcs_to_path(model_uri, local_path)
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
    """
    Carga una sola vez por instancia, con lock.
    Si load_model falla, borra cache y reintenta 1 vez inmediatamente.
    """
    global _MODEL, _MODEL_HW, _LABELS

    if _MODEL is not None and _MODEL_HW is not None:
        return _MODEL, _MODEL_HW, _LABELS

    with _MODEL_LOCK:
        if _MODEL is not None and _MODEL_HW is not None:
            return _MODEL, _MODEL_HW, _LABELS

        model_uri = (getattr(settings, "classifier_model_uri", None) or os.getenv("IRFLIES_CLASSIFIER_MODEL_URI", "")).strip()
        if not model_uri:
            raise RuntimeError("Falta IRFLIES_CLASSIFIER_MODEL_URI (gs://.../refit_model.keras o .h5)")

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

            # Re-descarga + reintento
            local_path = _ensure_model_local_path(model_uri)
            _MODEL = tf.keras.models.load_model(local_path, compile=False)

        _MODEL_HW = _infer_hw(_MODEL)
        _LABELS = _load_labels_from_env()

        log.info("Modelo cargado OK. input_hw=%s labels=%s", _MODEL_HW, _LABELS)
        return _MODEL, _MODEL_HW, _LABELS


def _preprocess(image_bytes: bytes, hw: Tuple[int, int]) -> np.ndarray:
    h, w = hw
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    arr = np.array(img)  # (H,W,3) uint8

    arr_tf = tf.convert_to_tensor(arr)
    arr_tf = tf.image.resize(arr_tf, (h, w), method="bilinear")
    arr = arr_tf.numpy().astype(np.float32)

    arr = arr / 255.0
    x = np.expand_dims(arr, axis=0)  # (1,h,w,3)
    return x


def classify_image(image_bytes: bytes) -> ClassifyResponse:
    if not settings.classifier_enabled:
        return ClassifyResponse(label="not_configured", score=0.0, probs={})

    model, hw, labels = _load_model_if_needed()
    x = _preprocess(image_bytes, hw)

    pred = model.predict(x, verbose=0)
    if isinstance(pred, list):
        pred = pred[0]
    pred = np.array(pred)

    if pred.ndim == 2 and pred.shape[0] == 1:
        pred = pred[0]

    if pred.ndim == 1 and pred.size > 1:
        vec = pred.astype(np.float32)

        s = float(np.sum(vec))
        if (vec.min() < 0.0) or (vec.max() > 1.0 + 1e-3) or (abs(s - 1.0) > 1.0e-2):
            vec = tf.nn.softmax(vec).numpy().astype(np.float32)

        idx = int(np.argmax(vec))
        score = float(vec[idx])

        def name(i: int) -> str:
            if labels and 0 <= i < len(labels):
                return labels[i]
            return str(i)

        probs: Dict[str, float] = {name(i): float(vec[i]) for i in range(vec.size)}
        return ClassifyResponse(label=name(idx), score=score, probs=probs)

    # fallback “regresión” o salida escalar
    try:
        val = float(np.ravel(pred)[0])
    except Exception:
        val = 0.0

    return ClassifyResponse(label="value", score=val, probs={})
