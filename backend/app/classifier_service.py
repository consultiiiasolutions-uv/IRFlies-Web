# backend/app/classifier_service.py
import io
import os
import json
import logging
from typing import Dict, List, Optional, Tuple

import numpy as np
from PIL import Image
from google.cloud import storage
import tensorflow as tf

from .config import settings
from .schemas import ClassifyResponse

log = logging.getLogger("irflies.classifier")

_MODEL = None
_MODEL_HW = None  # (H, W)
_LABELS = None    # Optional[List[str]]
_GCS = None       # storage.Client()


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


def _ensure_model_local_path(model_uri: str) -> str:
    """
    Descarga el modelo desde GCS a /tmp si hace falta.
    Si model_uri no es gs://, se asume path local dentro del container.
    """
    if model_uri.startswith("gs://"):
        bucket, blob = _parse_gcs_uri(model_uri)
        filename = os.path.basename(blob)
        local_path = os.path.join("/tmp", filename)

        # Si ya existe y pesa > 0, no vuelvas a bajar
        if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
            return local_path

        log.info("Descargando modelo de GCS: %s -> %s", model_uri, local_path)
        client = _get_gcs_client()
        client.bucket(bucket).blob(blob).download_to_filename(local_path)

        size = os.path.getsize(local_path)
        log.info("Modelo descargado OK (%d bytes): %s", size, local_path)
        return local_path

    return model_uri


def _load_model_if_needed() -> Tuple[tf.keras.Model, Tuple[int, int], Optional[List[str]]]:
    global _MODEL, _MODEL_HW, _LABELS

    if _MODEL is not None and _MODEL_HW is not None:
        return _MODEL, _MODEL_HW, _LABELS

    model_uri = os.getenv("IRFLIES_CLASSIFIER_MODEL_URI", "").strip()
    if not model_uri:
        raise RuntimeError("Falta IRFLIES_CLASSIFIER_MODEL_URI (gs://.../refit_model.keras)")

    local_path = _ensure_model_local_path(model_uri)

    log.info("Cargando modelo Keras desde: %s", local_path)
    _MODEL = tf.keras.models.load_model(local_path, compile=False)

    # Detecta input shape (batch, H, W, C)
    inp = _MODEL.input_shape
    if isinstance(inp, list):
        inp = inp[0]
    if not (isinstance(inp, tuple) and len(inp) >= 3):
        raise RuntimeError(f"input_shape inesperado: {inp}")

    h = int(inp[1])
    w = int(inp[2])
    _MODEL_HW = (h, w)
    _LABELS = _load_labels_from_env()

    log.info("Modelo cargado. input_hw=(%d,%d). labels=%s", h, w, _LABELS)
    return _MODEL, _MODEL_HW, _LABELS


def _preprocess(image_bytes: bytes, hw: Tuple[int, int]) -> np.ndarray:
    h, w = hw
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    arr = np.array(img)  # (H,W,3) uint8

    # Resize
    arr_tf = tf.convert_to_tensor(arr)
    arr_tf = tf.image.resize(arr_tf, (h, w), method="bilinear")
    arr = arr_tf.numpy().astype(np.float32)

    # Normaliza a [0,1]
    arr = arr / 255.0
    x = np.expand_dims(arr, axis=0)  # (1,h,w,3)
    return x


def classify_image(image_bytes: bytes) -> ClassifyResponse:
    # Si no está activado, seguimos respondiendo como antes
    if not settings.classifier_enabled:
        return ClassifyResponse(label="not_configured", score=0.0, probs={})

    model, hw, labels = _load_model_if_needed()
    x = _preprocess(image_bytes, hw)

    # Predict
    pred = model.predict(x, verbose=0)
    if isinstance(pred, list):
        pred = pred[0]
    pred = np.array(pred)

    # Si viene (1,n) -> (n,)
    if pred.ndim == 2 and pred.shape[0] == 1:
        pred = pred[0]

    # Caso clasificación: vector tamaño n
    if pred.ndim == 1 and pred.size > 1:
        vec = pred.astype(np.float32)

        # Si no parece softmax, aplica softmax
        s = float(np.sum(vec))
        if (vec.min() < 0.0) or (vec.max() > 1.0 + 1e-3) or (abs(s - 1.0) > 1e-2):
            vec = tf.nn.softmax(vec).numpy().astype(np.float32)

        idx = int(np.argmax(vec))
        score = float(vec[idx])

        def name(i: int) -> str:
            if labels and 0 <= i < len(labels):
                return labels[i]
            return str(i)

        probs: Dict[str, float] = {name(i): float(vec[i]) for i in range(vec.size)}
        return ClassifyResponse(label=name(idx), score=score, probs=probs)

    # Caso “regresión” o salida rara: devuelve valor crudo
    try:
        val = float(np.ravel(pred)[0])
    except Exception:
        val = 0.0

    return ClassifyResponse(label="value", score=val, probs={})
