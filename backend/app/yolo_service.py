# backend/app/yolo_service.py

from typing import List
from .schemas import RoiXYXY  # si ya lo tienes; si no, quita esta línea y devuelve dicts

def detect_rois_stub(image_bytes: bytes, conf: float = 0.25) -> List[RoiXYXY]:
    """
    Stub temporal: devuelve ROIs vacíos.
    conf se acepta para que el endpoint no truene.
    """
    return []
