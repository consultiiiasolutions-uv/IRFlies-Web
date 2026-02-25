from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Env vars (prefijo IRFLIES_)
    models_bucket: str = "irflies-uv-models"
    tmp_bucket: str = "irflies-uv-tmp"

    max_upload_mb: int = 10
    signed_url_ttl_seconds: int = 900  # 15 min
    tmp_prefix: str = ""  # opcional: "tmp/"

    # Flags (para cuando actives inferencia real)
    yolo_enabled: bool = False
    classifier_enabled: bool = False

    # Modelo clasificador (GCS o path local)
    classifier_model_uri: str = ""

    model_config = SettingsConfigDict(
        env_prefix="IRFLIES_",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
