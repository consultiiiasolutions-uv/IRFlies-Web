# backend/app/storage.py
import re
import os
import uuid
import logging
from datetime import timedelta
from typing import Optional, Tuple, List

import google.auth
from google.auth.transport.requests import Request
from google.auth import impersonated_credentials
from google.cloud import storage

from .config import settings

log = logging.getLogger("irflies.storage")

_GCS_URI_RE = re.compile(r"^gs://([^/]+)/(.+)$")


def parse_gcs_uri(gcs_uri: str) -> Tuple[str, str]:
    m = _GCS_URI_RE.match(gcs_uri.strip())
    if not m:
        raise ValueError("gcs_uri inválido. Usa formato gs://bucket/obj")
    return m.group(1), m.group(2)


def gcs_client() -> storage.Client:
    # En Cloud Run usa ADC automáticamente (service account del servicio).
    return storage.Client()


def download_bytes(gcs_uri: str, timeout: int = 60) -> bytes:
    bucket_name, object_name = parse_gcs_uri(gcs_uri)
    client = gcs_client()
    blob = client.bucket(bucket_name).blob(object_name)
    return blob.download_as_bytes(timeout=timeout)


def list_objects(bucket_name: str, prefix: str = "", limit: int = 200) -> List[str]:
    client = gcs_client()
    out: List[str] = []
    for b in client.list_blobs(bucket_name, prefix=prefix, max_results=limit):
        out.append(b.name)
    return out


def delete_object(bucket_name: str, object_name: str) -> None:
    client = gcs_client()
    client.bucket(bucket_name).blob(object_name).delete()


def new_tmp_object_name(filename: str, prefix: str = "") -> str:
    """
    Construye un nombre seguro para el bucket temporal.

    - settings.tmp_prefix (base) + prefix (request) + uuid + ext
    - Evita '//' y asegura '/' final si hay prefijo.
    """
    base = (settings.tmp_prefix or "").strip("/")
    extra = (prefix or "").strip("/")

    parts = [p for p in [base, extra] if p]
    final_prefix = "/".join(parts)
    if final_prefix:
        final_prefix += "/"

    ext = ""
    if filename and "." in filename:
        ext = "." + filename.split(".")[-1].lower()

    return f"{final_prefix}{uuid.uuid4().hex}{ext}"


def _get_adc(scopes: list[str]):
    creds, _ = google.auth.default(scopes=scopes)
    if not creds.valid:
        creds.refresh(Request())
    return creds


def _guess_signer_sa_email(source_creds) -> Optional[str]:
    """
    1) IRFLIES_SIGNER_SA (recomendado)
    2) si el ADC trae service_account_email (Cloud Run/Compute suele traerlo)
    """
    env_sa = os.getenv("IRFLIES_SIGNER_SA", "").strip()
    if env_sa:
        return env_sa

    sa_email = getattr(source_creds, "service_account_email", None)
    if sa_email:
        return sa_email

    return None


def generate_v4_signed_upload_url(
    bucket_name: str,
    object_name: str,
    content_type: str,
    ttl_seconds: int,
) -> str:
    """
    Signed URL (V4) para subir con PUT.

    - En local (si tus credenciales *sí* pueden firmar), firma directo.
    - En Cloud Run, normalmente necesitas IAM signBlob -> impersonated_credentials.

    Requisitos IAM (para el SA que corre Cloud Run):
      - roles/iam.serviceAccountTokenCreator sobre el SA firmante (IRFLIES_SIGNER_SA)
      - roles/storage.objectCreator (o superior) en el bucket destino para quien sube
    """
    if not content_type:
        # Evita firmar con content_type vacío si el cliente luego manda uno distinto.
        content_type = "application/octet-stream"

    ttl_seconds = int(ttl_seconds)
    ttl_seconds = max(1, min(ttl_seconds, 3600))  # IAMCredentials máx 1h

    client = storage.Client()
    blob = client.bucket(bucket_name).blob(object_name)

    # 1) ADC
    source_creds = _get_adc(scopes=["https://www.googleapis.com/auth/cloud-platform"])

    # 2) Intento: firmar directo si el credential puede (ej. keyfile local)
    try:
        if hasattr(source_creds, "sign_bytes"):
            return blob.generate_signed_url(
                version="v4",
                expiration=timedelta(seconds=ttl_seconds),
                method="PUT",
                content_type=content_type,
                credentials=source_creds,
            )
    except Exception as e:
        log.info("Firma directa falló; intentaré impersonation. reason=%s", e)

    # 3) Impersonation (Cloud Run-friendly)
    signer_sa = _guess_signer_sa_email(source_creds)
    if not signer_sa:
        raise RuntimeError(
            "No pude determinar el service account firmante. "
            "Setea IRFLIES_SIGNER_SA=tu-sa@proyecto.iam.gserviceaccount.com"
        )

    target_creds = impersonated_credentials.Credentials(
        source_credentials=source_creds,
        target_principal=signer_sa,
        target_scopes=["https://www.googleapis.com/auth/cloud-platform"],
        lifetime=ttl_seconds,
    )

    return blob.generate_signed_url(
        version="v4",
        expiration=timedelta(seconds=ttl_seconds),
        method="PUT",
        content_type=content_type,
        credentials=target_creds,
    )
