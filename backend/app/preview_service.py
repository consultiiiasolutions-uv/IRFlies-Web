from .schemas import RoiXYXY
from .utils_image import load_image_rgb, draw_rois, image_to_png_bytes


def build_preview_png(image_bytes: bytes, rois: list[RoiXYXY]) -> bytes:
    img = load_image_rgb(image_bytes)
    img = draw_rois(img, rois)
    return image_to_png_bytes(img)
