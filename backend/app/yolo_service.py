import io
import os
import logging
import tempfile
import threading
import hashlib
from typing import List, Optional, Tuple

from PIL import Image, ImageOps
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


def _cache_path_for_uri(model_uri: str, generation: Optional[str] = None) -> str:
    """Cachea por URI + generación para evitar usar pesos viejos si se sobrescribe el .pt."""
    base_dir = "/tmp/irflies_models"
    os.makedirs(base_dir, exist_ok=True)
    key = model_uri if generation is None else f"{model_uri}#generation={generation}"
    h = hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]
    return os.path.join(base_dir, f"yolo_{h}.pt")


def _ensure_weights_local(model_uri: str) -> str:
    if not model_uri.startswith("gs://"):
        if not os.path.exists(model_uri) or os.path.getsize(model_uri) <= 0:
            raise RuntimeError(f"Modelo YOLO local inválido: {model_uri}")
        return model_uri

    bucket_name, blob_name = _parse_gcs_uri(model_uri)
    client = _get_gcs_client()
    blob = client.bucket(bucket_name).blob(blob_name)
    blob.reload()

    expected = int(blob.size) if blob.size is not None else None
    generation = str(blob.generation) if blob.generation is not None else None
    local_path = _cache_path_for_uri(model_uri, generation=generation)

    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        if expected is None or os.path.getsize(local_path) == expected:
            return local_path
        log.warning("Cache YOLO con tamaño distinto. Se redescarga. local=%s expected=%s", os.path.getsize(local_path), expected)
        try:
            os.remove(local_path)
        except Exception:
            pass

    with tempfile.NamedTemporaryFile(prefix="dl_yolo_", suffix=".pt", dir=os.path.dirname(local_path), delete=False) as tmp:
        tmp_path = tmp.name

    try:
        log.info("Descargando YOLO weights: %s -> %s (expected=%s generation=%s)", model_uri, tmp_path, expected, generation)
        blob.download_to_filename(tmp_path)

        got = os.path.getsize(tmp_path)
        if got <= 0:
            raise RuntimeError("Descarga YOLO vacía")
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
    global _YOLO
    if _YOLO is not None:
        return _YOLO

    with _YOLO_LOCK:
        if _YOLO is not None:
            return _YOLO

        from ultralytics import YOLO

        model_uri = (settings.yolo_model_uri or os.getenv("IRFLIES_YOLO_MODEL_URI", "")).strip()
        if not model_uri:
            raise RuntimeError("Falta IRFLIES_YOLO_MODEL_URI")

        local_path = _ensure_weights_local(model_uri)
        log.info("Cargando YOLO desde %s", local_path)

        _YOLO = YOLO(local_path)
        return _YOLO


def detect_rois(image_bytes: bytes, conf: Optional[float] = None) -> List[RoiXYXY]:
    """Detecta hasta seis regiones de ojos según IRFLIES_YOLO_MAX_DETECTIONS.

    El flujo replica lo más importante del escritorio: corrige orientación EXIF, convierte a RGB,
    guarda temporalmente la imagen y entrega una ruta local a Ultralytics. No se aplica NMS manual
    adicional porque Ultralytics ya lo hace internamente.
    """
    if not settings.yolo_enabled:
        return []

    effective_conf = settings.default_detection_conf if conf is None else float(conf)
    max_det = max(1, int(settings.yolo_max_detections or 10))
    iou = float(settings.yolo_iou_thresh or 0.60)

    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img).convert("RGB")
    w_img, h_img = img.size

    yolo = _load_yolo_if_needed()

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        img.save(tmp_path)

        log.info(
            "[yolo] predict conf=%.4f iou=%.4f max_det=%d tmp_path=%s size=(%d,%d)",
            effective_conf,
            iou,
            max_det,
            tmp_path,
            w_img,
            h_img,
        )

        res = yolo.predict(
            source=tmp_path,
            conf=effective_conf,
            iou=iou,
            max_det=max_det,
            verbose=False,
        )[0]

        if res.boxes is None or len(res.boxes) == 0:
            log.info("[yolo] sin detecciones")
            return []

        names = getattr(res, "names", None) or getattr(yolo, "names", None) or {}
        rois: List[RoiXYXY] = []

        for box in res.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            x1 = int(max(0, min(w_img - 1, round(x1))))
            y1 = int(max(0, min(h_img - 1, round(y1))))
            x2 = int(max(0, min(w_img, round(x2))))
            y2 = int(max(0, min(h_img, round(y2))))

            if x2 <= x1 or y2 <= y1:
                continue

            score = float(box.conf[0].item()) if box.conf is not None else 0.0
            cls_id = int(box.cls[0].item()) if box.cls is not None else 0
            label = names.get(cls_id, str(cls_id)) if isinstance(names, dict) else str(cls_id)

            rois.append(
                RoiXYXY(
                    x1=x1,
                    y1=y1,
                    x2=x2,
                    y2=y2,
                    score=score,
                    label=str(label),
                )
            )

        rois.sort(key=lambda r: (r.score if r.score is not None else -1.0), reverse=True)
        rois = rois[:max_det]

        log.info(
            "[yolo] detecciones=%s",
            [
                {"x1": r.x1, "y1": r.y1, "x2": r.x2, "y2": r.y2, "score": r.score, "label": r.label}
                for r in rois
            ],
        )
        return rois

    finally:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass
