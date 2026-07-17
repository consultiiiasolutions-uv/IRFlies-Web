from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración de IRFlies-Web.

    Todas estas variables pueden modificarse en Cloud Run usando el prefijo IRFLIES_.
    Ejemplo: IRFLIES_YOLO_MAX_DETECTIONS=6.
    """

    # Buckets
    models_bucket: str = "irflies-uv-models"
    tmp_bucket: str = "irflies-uv-tmp"

    # Operación general
    max_upload_mb: int = 10
    signed_url_ttl_seconds: int = 900
    tmp_prefix: str = ""

    # Detección YOLO
    yolo_enabled: bool = False
    yolo_model_uri: str = ""
    yolo_max_detections: int = 10
    yolo_iou_thresh: float = 0.60
    default_detection_conf: float = 0.25

    # Clasificación Keras / H5
    classifier_enabled: bool = False
    classifier_model_uri: str = ""
    classifier_labels_csv: str = ""
    classifier_labels_json: str = ""

    # Preprocesamiento del clasificador.
    # Opciones: efficientnetv2, scale_0_1, none
    classifier_preprocess: str = "efficientnetv2"

    # Interpretación de la salida del clasificador.
    # Opciones: auto, softmax, probabilities, raw
    classifier_output_mode: str = "auto"

    model_config = SettingsConfigDict(
        env_prefix="IRFLIES_",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
