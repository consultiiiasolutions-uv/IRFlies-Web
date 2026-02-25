from __future__ import annotations

import base64
import io
import json
from typing import Any, Dict, List, Optional, Tuple, Union

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel, Field
from PIL import Image, ImageDraw


app = FastAPI(title="IRFlies API", version="0.1.0")


# ---- Modelos de datos ----
class RoiXYXY(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int


class RoiXYWH(BaseModel):
    x: int
    y: int
    w: int
    h: int


Roi = Union[RoiXYXY, RoiXYWH]


class PreviewJsonRequest(BaseModel):
    image_base64: str = Field(..., description="Imagen en base64 (png/jpg)")
    rois: List[Dict[str, Any]] = Field(default_factory=list)


def _parse_rois(raw: Any) -> List[Tuple[int, int, int, int]]:
    """
    Acepta ROIs en dos formatos:
    - {x1,y1,x2,y2}
    - {x,y,w,h}
    Regresa lista de (x1,y1,x2,y2)
    """
    if raw is None:
        return []

    if isinstance(raw, str):
        raw = raw.strip()
        if not raw:
            return []
        raw = json.loads(raw)

    if not isinstance(raw, list):
        raise ValueError("ROIs debe ser una lista.")

    out: List[Tuple[int, int, int, int]] = []
    for r in raw:
        if not isinstance(r, dict):
            raise ValueError("Cada ROI debe ser un objeto/dict.")

        if all(k in r for k in ("x1", "y1", "x2", "y2")):
            x1, y1, x2, y2 = int(r["x1"]), int(r["y1"]), int(r["x2"]), int(r["y2"])
        elif all(k in r for k in ("x", "y", "w", "h")):
            x1, y1 = int(r["x"]), int(r["y"])
            x2, y2 = x1 + int(r["w"]), y1 + int(r["h"])
        else:
            raise ValueError("ROI inválido. Usa {x1,y1,x2,y2} o {x,y,w,h}.")

        out.append((x1, y1, x2, y2))
    return out


def _load_image_bytes(image_bytes: bytes) -> Image.Image:
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img = img.convert("RGB")
        return img
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No pude leer la imagen: {e}")


def _draw_rois(img: Image.Image, rois_xyxy: List[Tuple[int, int, int, int]]) -> Image.Image:
    draw = ImageDraw.Draw(img)
    w, h = img.size
    for (x1, y1, x2, y2) in rois_xyxy:
        # clamp básico
        x1 = max(0, min(x1, w - 1))
        y1 = max(0, min(y1, h - 1))
        x2 = max(0, min(x2, w - 1))
        y2 = max(0, min(y2, h - 1))
        if x2 <= x1 or y2 <= y1:
            continue
        draw.rectangle([x1, y1, x2, y2], outline="red", width=3)
    return img


@app.get("/health")
def health():
    return {"ok": True}


# ---- Endpoint 1: multipart/form-data ----
# file: imagen
# rois_json: string JSON con la lista de ROIs
@app.post("/roi/preview")
async def roi_preview_form(
    file: UploadFile = File(...),
    rois_json: str = Form(default="[]"),
):
    image_bytes = await file.read()
    img = _load_image_bytes(image_bytes)

    try:
        rois = _parse_rois(rois_json)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    img = _draw_rois(img, rois)
    out = io.BytesIO()
    img.save(out, format="PNG")
    return Response(content=out.getvalue(), media_type="image/png")


# ---- Endpoint 2: JSON con base64 ----
@app.post("/roi/preview_json")
def roi_preview_json(payload: PreviewJsonRequest):
    try:
        image_bytes = base64.b64decode(payload.image_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="image_base64 inválido.")

    img = _load_image_bytes(image_bytes)

    try:
        rois = _parse_rois(payload.rois)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    img = _draw_rois(img, rois)
    out = io.BytesIO()
    img.save(out, format="PNG")
    b64 = base64.b64encode(out.getvalue()).decode("utf-8")
    return JSONResponse({"image_base64_png": b64})
