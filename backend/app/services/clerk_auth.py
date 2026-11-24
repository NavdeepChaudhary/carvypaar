"""Sign in with Clerk.

The browser signs in with Clerk, gets a short-lived Clerk session token (an RS256 JWT)
and posts it to /api/auth/clerk. We verify it ourselves before trusting anything:
  * RS256 signature against the Clerk instance's published keys (JWKS, cached for an hour)
  * `iss` is our Clerk instance (derived from CLERK_PUBLISHABLE_KEY), `exp`/`nbf`/`iat` valid
  * `azp` (the page that requested the token), when present, is one of our CORS origins

The session token doesn't carry the user's email, so on sign-in we read the user from
Clerk's Backend API (CLERK_SECRET_KEY) and only accept a *verified* primary email.

Then we find the user by Clerk's stable user ID. Failing that, we link the account whose
email matches (safe because Clerk verified the address). Failing that, we create a new
buyer account. The caller then issues a normal CarvyPaar session for that user.
"""
from __future__ import annotations

import base64
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from functools import lru_cache

import jwt
from jwt import PyJWKClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import utcnow
from app.models import User, UserRole
from app.services.auth_service import AuthError

logger = logging.getLogger("carvypaar.clerk")

CLERK_API_URL = "https://api.clerk.com/v1"
USER_AGENT = "CarvyPaar-API/1.0"


@dataclass(frozen=True)
class ClerkIdentity:
    user_id: str
    email: str
    name: str
    picture: str | None


def issuer_from_publishable_key(key: str) -> str:
    """pk_test_<base64("my-app.clerk.accounts.dev$")> -> https://my-app.clerk.accounts.dev"""
    try:
        encoded = key.split("_", 2)[2]
        host = base64.b64decode(encoded + "=" * (-len(encoded) % 4)).decode().rstrip("$")
    except (IndexError, ValueError, UnicodeDecodeError):
        raise ValueError("CLERK_PUBLISHABLE_KEY is not a valid Clerk publishable key") from None
    if not host or "/" in host or " " in host:
        raise ValueError("CLERK_PUBLISHABLE_KEY is not a valid Clerk publishable key")
    return f"https://{host}"


def _configured() -> bool:
    return bool(settings.CLERK_PUBLISHABLE_KEY and settings.CLERK_SECRET_KEY)


@lru_cache
def _jwks_client(issuer: str) -> PyJWKClient:
    return PyJWKClient(f"{issuer}/.well-known/jwks.json", cache_jwk_set=True, lifespan=3600, timeout=5)


def verify_session_token(token: str) -> str:
    """Verify a Clerk session token and return the Clerk user ID it asserts (raises AuthError)."""
    if not _configured():
        raise AuthError("Sign-in is not configured", status_code=503)
    issuer = issuer_from_publishable_key(settings.CLERK_PUBLISHABLE_KEY or "")
    try:
        signing_key = _jwks_client(issuer).get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=issuer,
            leeway=10,
            options={"require": ["exp", "iat", "iss", "sub"], "verify_aud": False},
        )
    except jwt.PyJWKClientConnectionError:
        logger.exception("Couldn't fetch Clerk signing keys")
        raise AuthError("Sign-in is temporarily unavailable", status_code=503) from None
    except jwt.PyJWTError:
        raise AuthError("Sign-in failed: invalid or expired session") from None

    azp = claims.get("azp")
    if azp and azp not in settings.cors_origins_list:
        raise AuthError("Sign-in failed: token was issued for another site")
    return str(claims["sub"])


def _fetch_clerk_user(user_id: str) -> dict:
    req = urllib.request.Request(
        f"{CLERK_API_URL}/users/{urllib.parse.quote(user_id, safe='')}",
        headers={
            "Authorization": f"Bearer {settings.CLERK_SECRET_KEY}",
            "Accept": "application/json",
            # Clerk's API sits behind a firewall that rejects Python's default
            # "Python-urllib" user agent with 403, so name ourselves.
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as res:  # noqa: S310 (fixed https URL)
            return json.load(res)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise AuthError("Sign-in failed: unknown account") from None
        # Clerk's error body says why (bad key, wrong instance, blocked...); it holds no secrets.
        try:
            detail = exc.read(300).decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            detail = ""
        logger.error("Clerk API returned %s for user lookup: %s", exc.code, detail)
    except (urllib.error.URLError, TimeoutError, ValueError):
        logger.exception("Couldn't reach the Clerk API")
    raise AuthError("Sign-in is temporarily unavailable", status_code=503)


def get_identity(user_id: str) -> ClerkIdentity:
    data = _fetch_clerk_user(user_id)
    primary_id = data.get("primary_email_address_id")
    primary = next((e for e in data.get("email_addresses") or [] if e.get("id") == primary_id), None)
    email = ((primary or {}).get("email_address") or "").strip().lower()
    if not email or ((primary or {}).get("verification") or {}).get("status") != "verified":
        raise AuthError("Your email address isn't verified yet", status_code=403)
    name = " ".join(p for p in (data.get("first_name"), data.get("last_name")) if p).strip()
    name = (name or data.get("username") or email.split("@")[0]).strip()[:120]
    picture = data.get("image_url") if data.get("has_image") else None
    return ClerkIdentity(user_id=user_id, email=email, name=name if len(name) >= 2 else "Driver", picture=picture)


def sign_in_with_clerk(db: Session, token: str) -> User:
    """Verify the Clerk token and return the matching CarvyPaar user (created or linked if needed)."""
    clerk_id = verify_session_token(token)
    user = db.scalar(select(User).where(User.clerk_user_id == clerk_id))
    if user is None:
        identity = get_identity(clerk_id)
        user = db.scalar(select(User).where(User.email == identity.email))
        if user is not None:
            if user.clerk_user_id and user.clerk_user_id != clerk_id:
                raise AuthError("This email is linked to a different account", status_code=409)
            user.clerk_user_id = clerk_id  # link the existing account (keeps its role, listings, bids)
        else:
            user = User(
                email=identity.email,
                full_name=identity.name,
                hashed_password=None,
                clerk_user_id=clerk_id,
                role=UserRole.BUYER,  # buyers can switch to selling from the Sell page
                is_active=True,  # set explicitly: the active check below runs before the flush
            )
            db.add(user)
        if not user.avatar_url and identity.picture:
            user.avatar_url = identity.picture[:500]
        user.is_verified = True  # Clerk verified the email address

    if not user.is_active:
        db.rollback()
        raise AuthError("This account has been deactivated", status_code=403)
    if user.email in settings.admin_emails and user.role != UserRole.ADMIN:
        logger.info("Promoting %s to admin (ADMIN_EMAILS)", user.id)
        user.role = UserRole.ADMIN
    user.last_login_at = utcnow()
    try:
        db.commit()
    except IntegrityError:  # two first-time sign-ins racing: the other one created the user
        db.rollback()
        user = db.scalar(select(User).where(User.clerk_user_id == clerk_id))
        if user is None:
            raise AuthError("Couldn't complete sign-in, please try again", status_code=409) from None
    db.refresh(user)
    return user
