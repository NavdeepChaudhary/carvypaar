"""Application settings loaded from environment variables / .env files.

Lookup order (later wins): ../.env (repo root, shared with docker-compose),
then ./.env (backend-specific overrides), then real environment variables.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_DEFAULT_SECRET = "dev-only-insecure-secret-key-change-me-0123456789"
_REPO_ROOT = Path(__file__).resolve().parents[3]  # backend/app/core/config.py -> repo root


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # --- General ---
    APP_NAME: str = "CarvyPaar"
    ENVIRONMENT: Literal["development", "test", "production"] = "development"
    API_PREFIX: str = "/api"
    LOG_LEVEL: str = "INFO"

    # --- Database ---
    # SQLite for local dev; docker-compose overrides this with PostgreSQL.
    DATABASE_URL: str = "sqlite:///./carvypaar.db"
    DB_ECHO: bool = False

    # --- Auth / JWT ---
    SECRET_KEY: str = _INSECURE_DEFAULT_SECRET
    JWT_ALGORITHM: str = "HS256"
    # Tokens carry and must match these, so a token minted by another service that
    # happens to share the secret is rejected.
    JWT_ISSUER: str = "carvypaar-api"
    JWT_AUDIENCE: str = "carvypaar-web"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    # A refresh token presented again within this window after rotation is treated
    # as a benign race (e.g. two tabs) instead of token theft.
    REFRESH_REUSE_GRACE_SECONDS: int = 10
    BCRYPT_ROUNDS: int = 12
    COOKIE_SECURE: bool = False  # set True in production (HTTPS only)

    # --- CORS (comma-separated list of origins) ---
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # --- Sign-in (Clerk) ---
    # From the Clerk dashboard -> API keys. The publishable key is public (it names the Clerk
    # instance whose tokens we accept); the secret key reads users' verified emails.
    CLERK_PUBLISHABLE_KEY: str | None = None
    CLERK_SECRET_KEY: str | None = None
    # Comma-separated emails that are made admins when they sign in (Clerk-verified emails only).
    ADMIN_EMAILS: str = ""

    # --- Marketplace commission shown on the admin dashboard (percent of each sale) ---
    COMMISSION_PCT: float = 2.0

    # --- Brute-force protection (per email + IP; see app/core/lockout.py) ---
    LOGIN_LOCKOUT_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15

    # --- Request size limits (rejected with 413 before the body is read) ---
    MAX_JSON_BODY_KB: int = 512

    # --- Redis (optional): shared rate limits, lockouts and WebSocket fan-out across workers ---
    REDIS_URL: str | None = None

    # --- Rate limiting ---
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: str = "200/minute"
    RATE_LIMIT_STORAGE_URI: str = "memory://"

    # --- File storage ---
    STORAGE_BACKEND: Literal["local"] = "local"
    UPLOAD_DIR: str = "uploads"
    PUBLIC_BASE_URL: str = "http://localhost:8000"
    MAX_UPLOAD_MB: int = 8
    MAX_IMAGES_PER_LISTING: int = 10
    MAX_IMAGE_DIMENSION: int = 2000  # longest side after resize (px)
    MAX_IMAGE_PIXELS: int = 40_000_000  # reject decompression bombs before decoding

    # --- Listings ---
    # When True, new listings start as "pending" until an admin approves them in
    # the admin dashboard (/admin). Admins' own listings are always published directly.
    REQUIRE_LISTING_APPROVAL: bool = True

    # --- Auctions ---
    # A bid arriving with <= ANTI_SNIPE_WINDOW_SECONDS left extends the end time
    # by ANTI_SNIPE_EXTENSION_SECONDS.
    ANTI_SNIPE_WINDOW_SECONDS: int = 120
    ANTI_SNIPE_EXTENSION_SECONDS: int = 120
    MIN_AUCTION_MINUTES: int = 10
    MAX_AUCTION_DAYS: int = 30
    AUCTION_WORKER_ENABLED: bool = True  # background task that opens/closes auctions
    AUCTION_TICK_SECONDS: float = 1.0
    WS_BID_RATE_LIMIT: int = 10  # bids per user...
    WS_BID_RATE_WINDOW_SECONDS: int = 10  # ...per this many seconds (per socket)

    # --- AI price predictor ---
    # Trained by ml/scripts/train.py. The file is re-read automatically when it changes.
    PRICE_MODEL_PATH: str = str(_REPO_ROOT / "ml" / "models" / "price_model.joblib")
    ML_DATA_DIR: str = str(_REPO_ROOT / "ml" / "data" / "processed")
    # Deal badges: asking price vs the AI estimate (and its 80% interval).
    DEAL_GREAT_BELOW_PCT: float = 10.0  # >=10% under the estimate (or under the interval) = great deal
    DEAL_OVERPRICED_ABOVE_PCT: float = 12.0  # >=12% over the estimate (or over the interval) = overpriced

    @field_validator("DATABASE_URL")
    @classmethod
    def _psycopg_driver(cls, v: str) -> str:
        """Hosting platforms (Render, Heroku, Railway) hand out postgres:// URLs."""
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def admin_emails(self) -> set[str]:
        return {e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()}

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def max_upload_request_bytes(self) -> int:
        """A full batch of photos plus multipart overhead."""
        return (self.MAX_UPLOAD_MB * self.MAX_IMAGES_PER_LISTING + 2) * 1024 * 1024

    @property
    def rate_limit_storage(self) -> str:
        if self.RATE_LIMIT_STORAGE_URI == "memory://" and self.REDIS_URL:
            return self.REDIS_URL
        return self.RATE_LIMIT_STORAGE_URI

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")

    @model_validator(mode="after")
    def _check_production_safety(self) -> "Settings":
        """Refuse to boot in production with insecure defaults."""
        if self.is_production:
            if self.SECRET_KEY == _INSECURE_DEFAULT_SECRET or len(self.SECRET_KEY) < 32:
                raise ValueError("SECRET_KEY must be set to a random value of 32+ chars in production")
            if "*" in self.cors_origins_list:
                raise ValueError("Wildcard CORS origins are not allowed in production")
            insecure = [o for o in self.cors_origins_list if not o.startswith("https://")]
            if insecure:
                raise ValueError(f"CORS_ORIGINS must be https:// in production (got {insecure})")
            if not self.COOKIE_SECURE:
                raise ValueError("COOKIE_SECURE must be true in production (refresh cookie over HTTPS only)")
            if self.is_sqlite:
                raise ValueError("Use PostgreSQL in production (DATABASE_URL is SQLite)")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
