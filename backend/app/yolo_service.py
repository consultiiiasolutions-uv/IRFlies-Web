from .config import settings
from .schemas import RoiXYXY


def detect_rois_stub(_image_bytes: bytes, _conf: float = 0.25) -> list[RoiXYXY]:
    # Stub intencional: para que el backend funcione ya.
    # Cuando actives YOLO real, aquí cargas pesos desde GCS y ejecutas inferencia.
    if not settings.yolo_enabled:
        return []
    raise RuntimeError("YOLO enabled pero no implementado todavía.")
