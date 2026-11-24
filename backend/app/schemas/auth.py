"""Auth request/response schemas."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.user import UserRead, validate_password_strength, validate_phone


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    # Admin accounts can never be self-registered; use `python -m app.cli create-admin`.
    role: Literal["buyer", "seller"] = "buyer"
    phone: str | None = Field(default=None, max_length=30)

    _strength = field_validator("password")(validate_password_strength)
    _phone = field_validator("phone")(validate_phone)

    @field_validator("email")
    @classmethod
    def _normalise_email(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Full name must be at least 2 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def _normalise_email(cls, v: str) -> str:
        return v.strip().lower()


class GoogleAuthRequest(BaseModel):
    """The ID token ("credential") Google Identity Services gives the browser."""

    credential: str = Field(min_length=20, max_length=4096)


class AuthProviders(BaseModel):
    google_client_id: str | None  # public value; null = Google sign-in disabled


class RefreshRequest(BaseModel):
    """Optional body: browsers send the refresh token via httpOnly cookie instead."""

    refresh_token: str | None = Field(default=None, max_length=2048)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int  # seconds until access token expiry
    user: UserRead
