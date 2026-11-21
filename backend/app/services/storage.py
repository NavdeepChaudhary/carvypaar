"""Pluggable file storage.

`StorageBackend` is the interface; `LocalStorage` writes to UPLOAD_DIR and is
served by FastAPI at /uploads. To move to S3 or Cloudinary, implement the same
three methods and return it from `get_storage()`; no route code changes.
"""
from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.core.config import settings


# Keys with this prefix point at images hosted elsewhere (e.g. seed data on
# Unsplash); they are never written or deleted by a storage backend.
EXTERNAL_PREFIX = "external:"


def is_external(key: str) -> bool:
    return key.startswith(EXTERNAL_PREFIX)


def delete_quietly(key: str) -> None:
    """Delete a stored file, skipping external keys and swallowing I/O errors."""
    if is_external(key):
        return
    try:
        get_storage().delete(key)
    except OSError:
        pass


@dataclass(frozen=True)
class StoredFile:
    key: str  # backend-specific identifier, persisted for later deletion
    url: str  # public URL the frontend can render


class StorageBackend(ABC):
    @abstractmethod
    def save(self, data: bytes, *, extension: str, folder: str = "") -> StoredFile:
        """Persist bytes under a new random name and return its key + URL."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Remove a stored file. Must not raise if the file is already gone."""

    @abstractmethod
    def url_for(self, key: str) -> str:
        """Public URL for a stored key."""


class LocalStorage(StorageBackend):
    def __init__(self, root: str | Path, public_base_url: str, url_prefix: str = "/uploads") -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.public_base_url = public_base_url.rstrip("/")
        self.url_prefix = url_prefix

    def _safe_path(self, key: str) -> Path:
        """Resolve a key inside root, rejecting path traversal (e.g. '../../etc')."""
        path = (self.root / key).resolve()
        if self.root not in path.parents:
            raise ValueError("Invalid storage key")
        return path

    def save(self, data: bytes, *, extension: str, folder: str = "") -> StoredFile:
        ext = extension.lower().lstrip(".")
        if not ext.isalnum() or len(ext) > 5:
            raise ValueError("Invalid file extension")
        safe_folder = "/".join(p for p in folder.split("/") if p and p not in (".", "..") and p.isalnum())
        key = f"{safe_folder}/{uuid.uuid4().hex}.{ext}" if safe_folder else f"{uuid.uuid4().hex}.{ext}"
        path = self._safe_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return StoredFile(key=key, url=self.url_for(key))

    def delete(self, key: str) -> None:
        try:
            path = self._safe_path(key)
        except ValueError:
            return
        path.unlink(missing_ok=True)
        # Tidy up now-empty folders (e.g. uploads/listings/37/), never the root itself.
        parent = path.parent
        while parent != self.root and self.root in parent.parents:
            try:
                parent.rmdir()  # only succeeds when empty
            except OSError:
                break
            parent = parent.parent

    def url_for(self, key: str) -> str:
        return f"{self.public_base_url}{self.url_prefix}/{key}"


@lru_cache
def get_storage() -> StorageBackend:
    if settings.STORAGE_BACKEND == "local":
        return LocalStorage(settings.UPLOAD_DIR, settings.PUBLIC_BASE_URL)
    raise RuntimeError(f"Unsupported storage backend: {settings.STORAGE_BACKEND}")
