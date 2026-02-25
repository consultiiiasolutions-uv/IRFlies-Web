from .config import settings
from .schemas import ClassifyResponse


def classify_stub(_image_bytes: bytes) -> ClassifyResponse:
    # Stub intencional: para que el backend funcione ya.
    # Cuando actives classifier real, aquí descargas .keras desde GCS y ejecutas predict.
    if not settings.classifier_enabled:
        return ClassifyResponse(label="not_configured", score=0.0, probs={})
    raise RuntimeError("Classifier enabled pero no implementado todavía.")
