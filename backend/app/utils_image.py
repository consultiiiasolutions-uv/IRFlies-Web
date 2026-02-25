import io
from PIL import Image, ImageDraw
from .schemas import RoiXYXY


def load_image_rgb(image_bytes: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(image_bytes))
    return img.convert("RGB")


def clamp_roi(roi: RoiXYXY, width: int, height: int) -> RoiXYXY:
    x1 = max(0, min(roi.x1, width - 1))
    y1 = max(0, min(roi.y1, height - 1))
    x2 = max(0, min(roi.x2, width - 1))
    y2 = max(0, min(roi.y2, height - 1))
    return RoiXYXY(x1=x1, y1=y1, x2=x2, y2=y2, score=roi.score, label=roi.label)


def draw_rois(img: Image.Image, rois: list[RoiXYXY]) -> Image.Image:
    draw = ImageDraw.Draw(img)
    w, h = img.size
    for r in rois:
        rr = clamp_roi(r, w, h)
        if rr.x2 <= rr.x1 or rr.y2 <= rr.y1:
            continue
        draw.rectangle([rr.x1, rr.y1, rr.x2, rr.y2], outline="red", width=3)
    return img


def image_to_png_bytes(img: Image.Image) -> bytes:
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()
