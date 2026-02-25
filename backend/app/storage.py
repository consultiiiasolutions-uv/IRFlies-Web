import re
import uuid
from datetime import timedelta
from typing import Optional, Tuple

import google.auth
from google.auth.transport.requests import Request
from google.auth import iam
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
    Signed URL (V4) sin key local: usa IAM signBlob.
    Requiere que el service account de Cloud Run tenga roles/iam.serviceAccountTokenCreator sobre sí mismo.
    """
    client = gcs_client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(object_name)

    # Credenciales ADC + signer IAM
    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    req = Request()
    credentials.refresh(req)

    sa_email = getattr(credentials, "service_account_email", None)
    if not sa_email:
        raise RuntimeError("No pude obtener service_account_email de ADC (necesario para signed URLs).")

    signer = iam.Signer(req, credentials, sa_email)

    return blob.generate_signed_url(
        version="v4",
        expiration=timedelta(seconds=ttl_seconds),
        method="PUT",
        content_type=content_type,
        credentials=credentials,
        signer=signer,
    )
