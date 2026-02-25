# backend/app/classifier_service.py
import io
import os
import json
import logging
import zipfile
import hashlib
import tempfile
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


def _cache_path_for_uri(model_uri: str) -> str:
    # cache determinista para no chocar con nombres iguales
    h = hashlib.sha256(model_uri.encode("utf-8")).hexdigest()[:16]
    base_dir = "/tmp/irflies_models"
    os.makedirs(base_dir, exist_ok=True)
    return os.path.join(base_dir, f"model_{h}.keras")


def _validate_keras_file(path: str, expected_size: Optional[int] = None) -> None:
    if not os.path.exists(path):
        raise RuntimeError(f"Modelo no existe en {path}")

    size = os.path.getsize(path)
    if size <= 0:
        raise RuntimeError(f"Modelo vacío en {path}")

    if expected_size is not None and size != expected_size:
        raise RuntimeError(f"Tamaño incorrecto: local={size} bytes, esperado={expected_size} bytes, path={path}")

    if not zipfile.is_zipfile(path):
        raise RuntimeError(f"El archivo no parece .keras (zip). path={path}")

    z = zipfile.ZipFile(path)
    names = z.namelist()
    # Lo mínimo que vimos en tu archivo:
    # ['metadata.json','config.json','model.weights.h5']
    required = {"metadata.json", "config.json", "model.weights.h5"}
    missing = required.difference(set(names))
    if missing:
        raise RuntimeError(f".keras inválido, faltan entradas {sorted(missing)}. path={path}")

    # Integridad: si algo está corrupto, testzip devuelve el primer nombre roto
    bad = z.testzip()
    if bad is not None:
        raise RuntimeError(f".keras corrupto: entrada dañada '{bad}'. path={path}")

    # Extra: el weights.h5 no debe venir en 0 bytes
    wsize = z.getinfo("model.weights.h5").file_size
    if wsize <= 0:
        raise RuntimeError(f"model.weights.h5 viene vacío dentro del .keras. path={path}")

    # Debug útil (sale en logs de Cloud Run)
    log.info("[classifier] local_path=%s size_bytes=%d zip_entries=%s weights_h5_bytes=%d",
             path, size, names, wsize)


def _download_gcs_to_path(model_uri: str, local_path: str) -> None:
    bucket_name, blob_name = _parse_gcs_uri(model_uri)
    client = _get_gcs_client()

    blob = client.bucket(bucket_name).get_blob(blob_name)
    if blob is None:
        raise RuntimeError(f"No existe el objeto en GCS: {model_uri}")

    expected_size = int(blob.size) if blob.size is not None else None

    os.makedirs(os.path.dirname(local_path), exist_ok=True)

    # Descarga atómica: primero a un tmp, luego rename.
    with tempfile.NamedTemporaryFile(prefix="dl_", suffix=".keras", dir=os.path.dirname(local_path), delete=False) as tmp:
        tmp_path = tmp.name

    try:
        log.info("Descargando modelo de GCS: %s -> %s (expected_size=%s)", model_uri, tmp_path, expected_size)
        blob.download_to_filename(tmp_path)

        # valida el tmp
        _validate_keras_file(tmp_path, expected_size=expected_size)

        # rename atómico
        os.replace(tmp_path, local_path)
        log.info("Modelo listo en cache: %s", local_path)
    except Exception:
        # limpia tmp si algo falló
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass
        raise


def _ensure_model_local_path(model_uri: str) -> str:
    """
    Descarga el modelo desde GCS a /tmp si hace falta (y valida).
    Si model_uri no es gs://, se asume path local dentro del container.
    """
    if model_uri.startswith("gs://"):
        local_path = _cache_path_for_uri(model_uri)

        # si existe, valida; si falla, bórralo y re-descarga
        if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
            try:
                _validate_keras_file(local_path, expected_size=None)  # size exacto ya se valida al bajar
                return local_path
            except Exception as e:
                log.warning("Cache de modelo inválida, re-descargando. reason=%s", e)
                try:
                    os.remove(local_path)
                except Exception:
                    pass

        _download_gcs_to_path(model_uri, local_path)
        return local_path

    # Path local en imagen/container
    _validate_keras_file(model_uri, expected_size=None)
    return model_uri


def _load_model_if_needed() -> Tuple[tf.keras.Model, Tuple[int, int], Optional[List[str]]]:
    global _MODEL, _MODEL_HW, _LABELS

    if _MODEL is not None and _MODEL_HW is not None:
        return _MODEL, _MODEL_HW, _LABELS

    model_uri = os.getenv("IRFLIES_CLASSIFIER_MODEL_URI", "").strip()
    if not model_uri:
        raise RuntimeError("Falta IRFLIES_CLASSIFIER_MODEL_URI (gs://.../refit_model.keras)")

    local_path = _ensure_model_local_path(model_uri)

    log.info("Cargando modelo Keras desde: %s (tf=%s)", local_path, tf.__version__)

    try:
        _MODEL = tf.keras.models.load_model(local_path, compile=False)
    except Exception as e:
        # MUY importante: si falló, borra el cache para no quedar atorado con archivo roto
        log.exception("Fallo load_model(). Borrando cache para reintentar en el siguiente request. err=%s", e)
        try:
            if model_uri.startswith("gs://") and os.path.exists(local_path):
                os.remove(local_path)
        except Exception:
            pass
        raise

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

    try:
        val = float(np.ravel(pred)[0])
    except Exception:
        val = 0.0

    return ClassifyResponse(label="value", score=val, probs={})
