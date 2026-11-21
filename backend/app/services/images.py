"""Upload validation and normalisation for listing photos.

Defences:
  * declared content type must be an allowed image type
  * hard size cap, read with a bounded read (a huge upload can't exhaust memory)
  * Pillow must recognise the bytes as JPEG/PNG/WebP (file extension and MIME type are ignored)
  * pixel-count cap blocks decompression bombs before full decode
  * re-encoding to WebP strips EXIF (GPS location!) and any embedded payloads
"""
from __future__ import annotations

from io import BytesIO

from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import settings

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
OUTPUT_EXTENSION = "webp"


class ImageValidationError(ValueError):
    """User-facing reason an image was rejected."""


def read_upload(upload: UploadFile) -> bytes:
    if (upload.content_type or "").lower() not in ALLOWED_CONTENT_TYPES:
        raise ImageValidationError(f"{upload.filename or 'File'}: only JPEG, PNG or WebP images are allowed")
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    data = upload.file.read(max_bytes + 1)
    if not data:
        raise ImageValidationError(f"{upload.filename or 'File'} is empty")
    if len(data) > max_bytes:
        raise ImageValidationError(f"{upload.filename or 'File'} is larger than {settings.MAX_UPLOAD_MB} MB")
    return data


def normalise_image(data: bytes, name: str = "Image") -> bytes:
    """Validate raw bytes and return a resized, metadata-free WebP."""
    try:
        with Image.open(BytesIO(data)) as probe:
            fmt = probe.format
            width, height = probe.size
            probe.verify()  # structural integrity check (doesn't decode pixels)
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
        raise ImageValidationError(f"{name} is not a valid image") from None

    if fmt not in ALLOWED_FORMATS:
        raise ImageValidationError(f"{name}: unsupported image format")
    if width * height > settings.MAX_IMAGE_PIXELS:
        raise ImageValidationError(f"{name} has too many pixels")
    if min(width, height) < 200:
        raise ImageValidationError(f"{name} is too small (minimum 200px on each side)")

    try:
        with Image.open(BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img)  # honour camera rotation before EXIF is dropped
            img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
            img.thumbnail((settings.MAX_IMAGE_DIMENSION, settings.MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)
            out = BytesIO()
            img.save(out, format="WEBP", quality=85, method=4)
            return out.getvalue()
    except (OSError, ValueError):
        raise ImageValidationError(f"{name} could not be processed") from None


def process_upload(upload: UploadFile) -> bytes:
    return normalise_image(read_upload(upload), upload.filename or "Image")
