# backend/app/yolo_service.py
import io
import os
import logging
import tempfile
import threading
from typing import List, Optional, Tuple

import numpy as np
from PIL import Image
from google.cloud import storage

from .config import settings
from .schemas import RoiXYXY

log = logging.getLogger("irflies.yolo")

_YOLO = None
_YOLO_LOCK = threading.Lock()
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


def _cache_path_for_uri(model_uri: str) -> str:
    base_dir = "/tmp/irflies_models"
    os.makedirs(base_dir, exist_ok=True)
    # nombre fijo para YOLO (un solo modelo)
    return os.path.join(base_dir, "eyes_yolo.pt")


def _ensure_weights_local(model_uri: str) -> str:
    """
    Descarga el .pt desde GCS de forma atómica y con verificación de tamaño.
    """
    if not model_uri.startswith("gs://"):
        if not os.path.exists(model_uri) or os.path.getsize(model_uri) <= 0:
            raise RuntimeError(f"Modelo YOLO local inválido: {model_uri}")
        return model_uri

    local_path = _cache_path_for_uri(model_uri)

    bucket_name, blob_name = _parse_gcs_uri(model_uri)
    client = _get_gcs_client()
    blob = client.bucket(bucket_name).blob(blob_name)
    blob.reload()
    expected = int(blob.size) if blob.size is not None else None

    # si ya existe y tamaño coincide, ok
    if os.path.exists(local_path) and expected and os.path.getsize(local_path) == expected:
        return local_path

    # descarga atómica
    with tempfile.NamedTemporaryFile(prefix="dl_", suffix=".pt", dir=os.path.dirname(local_path), delete=False) as tmp:
        tmp_path = tmp.name

    try:
        log.info("Descargando YOLO weights: %s -> %s (expected=%s)", model_uri, tmp_path, expected)
        blob.download_to_filename(tmp_path)

        got = os.path.getsize(tmp_path)
        if expected is not None and got != expected:
            raise RuntimeError(f"Descarga truncada: expected={expected} got={got}")

        os.replace(tmp_path, local_path)
        log.info("YOLO weights listos en %s bytes=%s", local_path, got)
        return local_path
    except Exception:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass
        raise


def _load_yolo_if_needed():
    """
    Carga YOLO una sola vez por instancia (lazy).
    """
    global _YOLO
    if _YOLO is not None:
        return _YOLO

    with _YOLO_LOCK:
        if _YOLO is not None:
            return _YOLO

        # Import aquí para no penalizar startup si YOLO está apagado
        from ultralytics import YOLO  # noqa: WPS433

        model_uri = (getattr(settings, "yolo_model_uri", None) or os.getenv("IRFLIES_YOLO_MODEL_URI", "")).strip()
        if not model_uri:
            raise RuntimeError("Falta IRFLIES_YOLO_MODEL_URI (gs://.../eyes_yolov8n_best.pt)")

        local_path = _ensure_weights_local(model_uri)
        log.info("Cargando YOLO desde %s", local_path)

        _YOLO = YOLO(local_path)
        return _YOLO

def _iou(a, b) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    iw = max(0.0, inter_x2 - inter_x1)
    ih = max(0.0, inter_y2 - inter_y1)
    inter = iw * ih
    if inter <= 0.0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return float(inter / union) if union > 0 else 0.0


def _nms_indices(boxes, scores, iou_thresh: float, max_det: int):
    # boxes: (N,4) float
    order = list(np.argsort(-scores))
    keep = []
    while order and len(keep) < max_det:
        i = order.pop(0)
        keep.append(i)
        new_order = []
        for j in order:
            if _iou(boxes[i], boxes[j]) < iou_thresh:
                new_order.append(j)
        order = new_order
    return keep

def detect_rois(image_bytes: bytes, conf: float = 0.25) -> List[RoiXYXY]:
    """
    Detecta ROIs (ojos) usando YOLO y devuelve lista de RoiXYXY.
    Si YOLO está deshabilitado, devuelve [].
    """
    if not settings.yolo_enabled:
        return []

    # Imagen a numpy
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    w_img, h_img = img.size
    arr = np.array(img)

    yolo = _load_yolo_if_needed()

    # max detections (por defecto 2 ojos)
    max_det = int(os.getenv("IRFLIES_YOLO_MAX_DETECTIONS", "2"))

    # Predict
    results = yolo.predict(source=arr, conf=float(conf), verbose=False)
    if not results:
        return []

    r0 = results[0]
    if r0.boxes is None or len(r0.boxes) == 0:
        return []

    # Boxes
    xyxy = r0.boxes.xyxy.cpu().numpy()  # (N,4)
    scores = r0.boxes.conf.cpu().numpy() if r0.boxes.conf is not None else np.ones((xyxy.shape[0],), dtype=np.float32)
    clss = r0.boxes.cls.cpu().numpy().astype(int) if r0.boxes.cls is not None else np.zeros((xyxy.shape[0],), dtype=int)

    # nombres de clase (si existen)
    names = getattr(r0, "names", None) or getattr(yolo, "names", None) or {}

    # ordenar por score desc y tomar top-k
    iou_thresh = float(os.getenv("IRFLIES_YOLO_IOU_THRESH", "0.6"))
    idxs = _nms_indices(xyxy, scores, iou_thresh=iou_thresh, max_det=max_det)

    rois: List[RoiXYXY] = []
    for i in idxs:
        x1, y1, x2, y2 = xyxy[i].tolist()

        # clamp a bounds
        x1 = int(max(0, min(w_img - 1, round(x1))))
        y1 = int(max(0, min(h_img - 1, round(y1))))
        x2 = int(max(0, min(w_img - 1, round(x2))))
        y2 = int(max(0, min(h_img - 1, round(y2))))

        if x2 <= x1 or y2 <= y1:
            continue

        cls_id = int(clss[i])
        label = names.get(cls_id, str(cls_id)) if isinstance(names, dict) else str(cls_id)

        rois.append(
            RoiXYXY(
                x1=x1, y1=y1, x2=x2, y2=y2,
                score=float(scores[i]),
                label=str(label),
            )
        )

    return rois
