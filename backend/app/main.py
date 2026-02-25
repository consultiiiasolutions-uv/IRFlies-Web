from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
from PIL import Image, ImageDraw
import io, json

app = FastAPI(title="IRFlies Backend", version="0.1.0")

@app.get("/health")
def health():
    return {"status": "ok"}

def _normalize_rois(rois):
    """
    Acepta:
      - dicts: {"x1","y1","x2","y2"}  o  {"x","y","w","h"}
      - listas/tuplas: [x1,y1,x2,y2]
    """
    boxes = []
    for r in rois:
        if isinstance(r, dict):
            if all(k in r for k in ("x1", "y1", "x2", "y2")):
                x1, y1, x2, y2 = r["x1"], r["y1"], r["x2"], r["y2"]
            elif all(k in r for k in ("x", "y", "w", "h")):
                x1, y1 = r["x"], r["y"]
                x2, y2 = r["x"] + r["w"], r["y"] + r["h"]
            else:
                raise ValueError("ROI dict inválido")
        elif isinstance(r, (list, tuple)) and len(r) == 4:
            x1, y1, x2, y2 = r
        else:
            raise ValueError("ROI inválido")

        boxes.append([int(x1), int(y1), int(x2), int(y2)])
    return boxes

@app.post("/roi/preview")
async def roi_preview(
    image: UploadFile = File(...),
    rois: str = Form(...),  # JSON string
):
    try:
        payload = json.loads(rois)
        rois_list = payload["rois"] if isinstance(payload, dict) and "rois" in payload else payload
        boxes = _normalize_rois(rois_list)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"ROIs inválidos: {e}")

    raw = await image.read()
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    draw = ImageDraw.Draw(im)

    # Dibujar recuadros
    for (x1, y1, x2, y2) in boxes:
        draw.rectangle([x1, y1, x2, y2], outline="red", width=3)

    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")
