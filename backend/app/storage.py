import re
import uuid
from typing import Optional, Tuple

from datetime import timedelta
import google.auth
from google.auth.transport.requests import Request
from google.auth import impersonated_credentials
from google.cloud import storage

from .config import settings


_GCS_URI_RE = re.compile(r"^gs://([^/]+)/(.+)$")


def parse_gcs_uri(gcs_uri: str) -> Tuple[str, str]:
    m = _GCS_URI_RE.match(gcs_uri.strip())
    if not m:
        raise ValueError("gcs_uri inválido. Usa formato gs://bucket/obj")
    return m.group(1), m.group(2)


def gcs_client() -> storage.Client:
    return storage.Client()


def download_bytes(gcs_uri: str) -> bytes:
    bucket_name, object_name = parse_gcs_uri(gcs_uri)
    client = gcs_client()
    blob = client.bucket(bucket_name).blob(object_name)
    return blob.download_as_bytes()


def list_objects(bucket_name: str, prefix: str = "", limit: int = 200) -> list[str]:
    client = gcs_client()
    out = []
    for b in client.list_blobs(bucket_name, prefix=prefix, max_results=limit):
        out.append(b.name)
    return out


def delete_object(bucket_name: str, object_name: str) -> None:
    client = gcs_client()
    client.bucket(bucket_name).blob(object_name).delete()


def new_tmp_object_name(filename: str, prefix: str = "") -> str:
    safe_prefix = prefix.strip("/")
    safe_prefix = f"{safe_prefix}/" if safe_prefix else settings.tmp_prefix
    safe_prefix = safe_prefix or ""
    ext = ""
    if "." in filename:
        ext = "." + filename.split(".")[-1].lower()
    return f"{safe_prefix}{uuid.uuid4().hex}{ext}"


def generate_v4_signed_upload_url(
    bucket_name: str,
    object_name: str,
    content_type: str,
    ttl_seconds: int,
) -> str:
    """
    Signed URL (V4) en Cloud Run sin key local.
    Usa IAMCredentials via impersonated_credentials.
    Requiere roles/iam.serviceAccountTokenCreator (ya lo intentaste dar).
    """
    client = storage.Client()
    blob = client.bucket(bucket_name).blob(object_name)

    source_credentials, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )

    # Asegura credenciales frescas
    if not source_credentials.valid:
        source_credentials.refresh(Request())

    # En Cloud Run esto normalmente existe
    sa_email = getattr(source_credentials, "service_account_email", None)
    if not sa_email:
        raise RuntimeError("No pude obtener service_account_email desde ADC en Cloud Run.")

    # Impersonar al mismo SA (o a otro) para poder firmar
    target_credentials = impersonated_credentials.Credentials(
        source_credentials=source_credentials,
        target_principal=sa_email,
        target_scopes=["https://www.googleapis.com/auth/devstorage.read_write"],
        lifetime=min(ttl_seconds, 3600),
    )

    return blob.generate_signed_url(
        version="v4",
        expiration=timedelta(seconds=ttl_seconds),
        method="PUT",
        content_type=content_type,
        credentials=target_credentials,
    )
