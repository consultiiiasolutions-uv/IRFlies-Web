from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import Response, JSONResponse
from typing import Optional

from .config import settings
from .schemas import (
    RoiXYXY,
    PreviewGcsRequest,
    DetectGcsRequest,
    DetectResponse,
    ClassifyGcsRequest,
    ClassifyResponse,
    SignedUploadUrlRequest,
    SignedUploadUrlResponse,
)
from .preview_service import build_preview_png
from .storage import download_bytes, new_tmp_object_name, generate_v4_signed_upload_url, list_objects, delete_object
from .yolo_service import detect_rois_stub
from .classifier_service import classify_image


app = FastAPI(title="IRFlies API", version="1.0.0")


def _enforce_max_size(data: bytes) -> None:
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Imagen excede límite de {settings.max_upload_mb}MB")


@app.get("/health")
def health():
    return {"ok": True}


# --------------------
# Preview (upload)
# --------------------
@app.post("/v1/preview/upload")
async def preview_upload(
    file: UploadFile = File(...),
    rois_json: str = Form(default="[]"),  # JSON string list[{"x1":..,"y1":..,"x2":..,"y2":..}]
):
    import json

    image_bytes = await file.read()
    _enforce_max_size(image_bytes)

    try:
        rois_raw = json.loads(rois_json) if rois_json else []
        rois = [RoiXYXY(**r) for r in rois_raw]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"rois_json inválido: {e}")

    png = build_preview_png(image_bytes, rois)
    return Response(content=png, media_type="image/png")


# --------------------
# Preview (GCS)
# --------------------
@app.post("/v1/preview/gcs")
def preview_gcs(payload: PreviewGcsRequest):
    image_bytes = download_bytes(payload.gcs_uri)
    _enforce_max_size(image_bytes)
    png = build_preview_png(image_bytes, payload.rois)
    return Response(content=png, media_type="image/png")


# --------------------
# Detect (upload / GCS) - stub
# --------------------
@app.post("/v1/detect/upload", response_model=DetectResponse)
async def detect_upload(file: UploadFile = File(...), conf: float = Form(default=0.25)):
    image_bytes = await file.read()
    _enforce_max_size(image_bytes)
    rois = detect_rois_stub(image_bytes, conf=conf)
    return DetectResponse(rois=rois)


@app.post("/v1/detect/gcs", response_model=DetectResponse)
def detect_gcs(payload: DetectGcsRequest):
    image_bytes = download_bytes(payload.gcs_uri)
    _enforce_max_size(image_bytes)
    rois = detect_rois_stub(image_bytes, conf=payload.conf)
    return DetectResponse(rois=rois)


# --------------------
# Classify (upload / GCS)
# --------------------
@app.post("/v1/classify/upload", response_model=ClassifyResponse)
async def classify_upload(file: UploadFile = File(...)):
    image_bytes = await file.read()
    _enforce_max_size(image_bytes)
    result = classify_image(image_bytes)
    return result


@app.post("/v1/classify/gcs", response_model=ClassifyResponse)
def classify_gcs(payload: ClassifyGcsRequest):
    image_bytes = download_bytes(payload.gcs_uri)
    _enforce_max_size(image_bytes)
    result = classify_image(image_bytes) 
    return result


# --------------------
# Storage ops
# --------------------
@app.post("/v1/storage/signed-upload-url", response_model=SignedUploadUrlResponse)
def signed_upload_url(req: SignedUploadUrlRequest):
    obj = new_tmp_object_name(req.filename, prefix=req.prefix)
    try:
        url = generate_v4_signed_upload_url(
            bucket_name=settings.tmp_bucket,
            object_name=obj,
            content_type=req.content_type,
            ttl_seconds=settings.signed_url_ttl_seconds,
        )
    except Exception as e:
        # Error típico si falta TokenCreator
        raise HTTPException(status_code=500, detail=f"No pude generar signed URL: {e}")

    gcs_uri = f"gs://{settings.tmp_bucket}/{obj}"
    return SignedUploadUrlResponse(
        signed_url=url,
        gcs_uri=gcs_uri,
        bucket=settings.tmp_bucket,
        object_name=obj,
        expires_in_seconds=settings.signed_url_ttl_seconds,
    )


@app.get("/v1/storage/tmp/list")
def tmp_list(prefix: Optional[str] = ""):
    p = (settings.tmp_prefix or "") + (prefix or "")
    objs = list_objects(settings.tmp_bucket, prefix=p)
    return {"bucket": settings.tmp_bucket, "prefix": p, "objects": objs}


@app.delete("/v1/storage/tmp/{object_name:path}")
def tmp_delete(object_name: str):
    delete_object(settings.tmp_bucket, object_name)
    return JSONResponse({"deleted": True, "bucket": settings.tmp_bucket, "object": object_name})
