"""User-facing schemas and shared field validators."""
from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import UserRole
from app.schemas.common import UtcDatetime

_PHONE_RE = re.compile(r"^\+?[0-9\s\-()]{7,20}$")


# The most common leaked passwords that satisfy "letters + digits" (lower-cased).
# A real deployment can extend this, or check the HIBP k-anonymity API.
COMMON_PASSWORDS = frozenset({
    "password1", "password12", "password123", "password1234", "passw0rd", "p@ssw0rd", "p@ssword1",
    "abc12345", "abcd1234", "qwerty123", "qwerty1234", "qwertyuiop1", "1q2w3e4r", "1qaz2wsx", "zaq12wsx",
    "iloveyou1", "welcome1", "welcome123", "letmein1", "admin123", "admin1234", "administrator1", "monkey123",
    "dragon123", "football1", "baseball1", "master123", "sunshine1", "princess1", "trustno1", "superman1",
    "batman123", "shadow123", "michael1", "charlie1", "jordan23", "test1234", "testing123", "changeme1",
    "secret123", "login123", "india123", "india@123", "mumbai123", "cricket123", "carvypaar1", "carvypaar123",
    "car12345", "ferrari1", "porsche911", "mustang1", "bmw12345", "a1b2c3d4", "aa123456", "asdf1234",
})


def validate_password_strength(value: str) -> str:
    """Shared rule: 8+ chars, <=72 bytes (bcrypt limit), a letter and a digit, not a common password."""
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if len(value.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 bytes long")
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("Password must contain at least one letter and one number")
    if value.lower() in COMMON_PASSWORDS:
        raise ValueError("This password is too common. Please choose something less guessable")
    return value


def validate_phone(value: str | None) -> str | None:
    if value is None or value.strip() == "":
        return None
    value = value.strip()
    if not _PHONE_RE.fullmatch(value):
        raise ValueError("Invalid phone number")
    return value


def clean_text(value: str | None) -> str | None:
    """Trim whitespace; collapse empty strings to None."""
    if value is None:
        return None
    value = value.strip()
    return value or None


class UserRead(BaseModel):
    """The full profile, only returned to the account owner (or admins)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    phone: str | None
    avatar_url: str | None
    bio: str | None
    location: str | None
    role: UserRole
    is_active: bool
    is_verified: bool
    has_password: bool  # False for Google-only accounts (they can set one in the profile)
    has_google: bool
    created_at: UtcDatetime


class PublicUser(BaseModel):
    """Safe subset shown to other users (e.g. seller card on a listing)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    avatar_url: str | None
    location: str | None
    role: UserRole
    created_at: UtcDatetime


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    bio: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=120)

    _clean = field_validator("full_name", "bio", "location", mode="before")(clean_text)
    _phone = field_validator("phone")(validate_phone)
