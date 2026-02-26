from pydantic import BaseModel, Field
from typing import List, Optional, Dict


class RoiXYXY(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int
    score: Optional[float] = None
    label: Optional[str] = None


class PreviewGcsRequest(BaseModel):
    gcs_uri: str = Field(..., description="gs://bucket/path/to/image.jpg")
    rois: List[RoiXYXY] = Field(default_factory=list)


class DetectGcsRequest(BaseModel):
    gcs_uri: str
    conf: float = 0.25


class DetectResponse(BaseModel):
    rois: List[RoiXYXY] = Field(default_factory=list)


class ClassifyGcsRequest(BaseModel):
    gcs_uri: str


class ClassifyResponse(BaseModel):
    label: str
    score: float
    probs: Dict[str, float] = Field(default_factory=dict)


class SignedUploadUrlRequest(BaseModel):
    content_type: str = Field(..., examples=["image/jpeg", "image/png"])
    filename: str = Field(..., examples=["foto.jpg"])
    prefix: str = Field(default="", description="prefijo dentro del bucket tmp, ej: user123/")


class SignedUploadUrlResponse(BaseModel):
    signed_url: str
    gcs_uri: str
    bucket: str
    object_name: str
    expires_in_seconds: int

class PipelineGcsRequest(BaseModel):
    gcs_uri: str
    conf: float = 0.03
    rois: List[RoiXYXY] = Field(default_factory=list)


class RoiPrediction(BaseModel):
    roi_index: int
    roi: RoiXYXY
    classification: ClassifyResponse


class PipelineResponse(BaseModel):
    rois: List[RoiXYXY] = Field(default_factory=list)
    predictions: List[RoiPrediction] = Field(default_factory=list)
