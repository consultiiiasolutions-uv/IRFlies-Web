from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import Response, JSONResponse
from typing import Optional, List
import io
from PIL import Image, ImageOps
import json

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
    PipelineGcsRequest,
    PipelineResponse,
    RoiPrediction,
    ApiConfigResponse,
)
from .preview_service import build_preview_png
from .storage import (
    download_bytes,
    new_tmp_object_name,
    generate_v4_signed_upload_url,
    list_objects,
    delete_object,
)
from .yolo_service import detect_rois
from contextlib import asynccontextmanager
from .classifier_service import (
    classify_image,
    classify_crops_batch,
    warmup_classifier,
)
from fastapi.middleware.cors import CORSMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.classifier_enabled:
        warmup_classifier()
    yield


app = FastAPI(
    title="IRFlies API",
    version="1.1.1",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.a\.run\.app",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _enforce_max_size(data: bytes) -> None:
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Imagen excede límite de {settings.max_upload_mb}MB")


def _parse_rois_json(rois_json: str) -> List[RoiXYXY]:
    try:
        rois_raw = json.loads(rois_json) if rois_json else []
        if not isinstance(rois_raw, list):
            raise ValueError("rois_json debe ser una lista")
        return [RoiXYXY(**r) for r in rois_raw]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"rois_json inválido: {e}")


def _crop_and_classify(image_bytes: bytes, rois: List[RoiXYXY]) -> PipelineResponse:
    if not rois:
        return PipelineResponse(rois=[], predictions=[])

    img = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes))).convert("RGB")
    w_img, h_img = img.size

    invalid = ClassifyResponse(label="invalid_roi", score=0.0, probs={})
    predictions: List[RoiPrediction] = []
    crops = []
    crop_map = []
    clamped_rois: List[RoiXYXY] = []

    for i, roi in enumerate(rois):
        x1 = max(0, min(w_img - 1, int(roi.x1)))
        y1 = max(0, min(h_img - 1, int(roi.y1)))
        x2 = max(0, min(w_img, int(roi.x2)))
        y2 = max(0, min(h_img, int(roi.y2)))
        roi_clamped = RoiXYXY(x1=x1, y1=y1, x2=x2, y2=y2, score=roi.score, label=roi.label)
        clamped_rois.append(roi_clamped)

        predictions.append(RoiPrediction(roi_index=i, roi=roi_clamped, classification=invalid))

        if x2 <= x1 or y2 <= y1:
            continue

        crops.append(img.crop((x1, y1, x2, y2)))
        crop_map.append(i)

    if crops:
        cls_list = classify_crops_batch(crops)
        for k, cls in enumerate(cls_list):
            predictions[crop_map[k]].classification = cls

    return PipelineResponse(rois=clamped_rois, predictions=predictions)


@app.get("/health")
def health():
    return {"ok": True, "version": app.version}


@app.get("/v1/config", response_model=ApiConfigResponse)
def api_config():
    labels = [x.strip() for x in (settings.classifier_labels_csv or "").split(",") if x.strip()]
    return ApiConfigResponse(
        yolo_enabled=settings.yolo_enabled,
        yolo_max_detections=settings.yolo_max_detections,
        yolo_iou_thresh=settings.yolo_iou_thresh,
        default_detection_conf=settings.default_detection_conf,
        classifier_enabled=settings.classifier_enabled,
        classifier_labels=labels,
        classifier_preprocess=settings.classifier_preprocess,
        classifier_output_mode=settings.classifier_output_mode,
        model_uris_configured={
            "yolo": bool(settings.yolo_model_uri),
            "classifier": bool(settings.classifier_model_uri),
        },
    )

# Preview (upload / GCS)
# --------------------
@app.post("/v1/preview/upload")
async def preview_upload(file: UploadFile = File(...), rois_json: str = Form(default="[]")):
    image_bytes = await file.read()
    _enforce_max_size(image_bytes)
    rois = _parse_rois_json(rois_json)
    png = build_preview_png(image_bytes, rois)
    return Response(content=png, media_type="image/png")


@app.post("/v1/preview/gcs")
def preview_gcs(payload: PreviewGcsRequest):
    image_bytes = download_bytes(payload.gcs_uri)
    _enforce_max_size(image_bytes)
    png = build_preview_png(image_bytes, payload.rois)
    return Response(content=png, media_type="image/png")


# --------------------
# Detect (upload / GCS)
# --------------------
@app.post("/v1/detect/upload", response_model=DetectResponse)
async def detect_upload(file: UploadFile = File(...), conf: float = Form(default=settings.default_detection_conf)):
    image_bytes = await file.read()
    _enforce_max_size(image_bytes)
    rois = detect_rois(image_bytes, conf=conf)
    return DetectResponse(rois=rois)


@app.post("/v1/detect/gcs", response_model=DetectResponse)
def detect_gcs(payload: DetectGcsRequest):
    image_bytes = download_bytes(payload.gcs_uri)
    _enforce_max_size(image_bytes)
    rois = detect_rois(image_bytes, conf=payload.conf)
    return DetectResponse(rois=rois)


# --------------------
# Classify (upload / GCS)
# --------------------
@app.post("/v1/classify/upload", response_model=ClassifyResponse)
async def classify_upload(file: UploadFile = File(...)):
    image_bytes = await file.read()
    _enforce_max_size(image_bytes)
    return classify_image(image_bytes)


@app.post("/v1/classify/gcs", response_model=ClassifyResponse)
def classify_gcs(payload: ClassifyGcsRequest):
    image_bytes = download_bytes(payload.gcs_uri)
    _enforce_max_size(image_bytes)
    return classify_image(image_bytes)


# --------------------
# Pipeline: detect -> crop -> classify; también modo manual con ROIs
# --------------------
@app.post("/v1/pipeline/upload", response_model=PipelineResponse)
async def pipeline_upload(
    file: UploadFile = File(...),
    conf: float = Form(default=settings.default_detection_conf),
    rois_json: str = Form(default=""),
):
    image_bytes = await file.read()
    _enforce_max_size(image_bytes)

    if rois_json and rois_json.strip():
        rois = _parse_rois_json(rois_json)
    else:
        rois = detect_rois(image_bytes, conf=conf)

    return _crop_and_classify(image_bytes, rois)


@app.post("/v1/pipeline/gcs", response_model=PipelineResponse)
def pipeline_gcs(payload: PipelineGcsRequest):
    image_bytes = download_bytes(payload.gcs_uri)
    _enforce_max_size(image_bytes)
    rois = payload.rois if payload.rois else detect_rois(image_bytes, conf=payload.conf)
    return _crop_and_classify(image_bytes, rois)


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
