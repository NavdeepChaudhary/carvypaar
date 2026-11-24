"""Sign in with Google (Google Identity Services, ID-token flow).

The browser gets a signed ID token (JWT) from Google and posts it to us. We verify it
ourselves; nothing from the client is trusted until these checks pass:
  * RS256 signature against Google's published keys (JWKS, cached for an hour)
  * `aud` == our GOOGLE_CLIENT_ID (a token minted for another app is useless here)
  * `iss` is accounts.google.com, `exp`/`iat` valid (10 s leeway)
  * `email_verified` is true

Then we find the user by Google's stable `sub`. Failing that, we link the account
whose email matches (safe because Google verified the address). Failing that,
we create a new buyer account with no password.
"""
from __future__ import annotations

import logging
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

logger = logging.getLogger("carvypaar.google")

GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    name: str
    picture: str | None


@lru_cache
def _jwks_client() -> PyJWKClient:
    return PyJWKClient(GOOGLE_JWKS_URL, cache_jwk_set=True, lifespan=3600, timeout=5)


def verify_google_credential(credential: str) -> GoogleIdentity:
    """Verify a Google ID token and return the identity it asserts (raises AuthError)."""
    if not settings.GOOGLE_CLIENT_ID:
        raise AuthError("Google sign-in is not configured", status_code=503)
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(credential)
        claims = jwt.decode(
            credential,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.GOOGLE_CLIENT_ID,
            leeway=10,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except jwt.PyJWKClientConnectionError:
        logger.exception("Couldn't fetch Google signing keys")
        raise AuthError("Google sign-in is temporarily unavailable", status_code=503) from None
    except jwt.PyJWTError:
        raise AuthError("Google sign-in failed: invalid or expired credential") from None

    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise AuthError("Google sign-in failed: unexpected issuer")
    email = (claims.get("email") or "").strip().lower()
    if not email or claims.get("email_verified") is not True:
        raise AuthError("Your Google account's email address isn't verified", status_code=403)
    name = (claims.get("name") or email.split("@")[0]).strip()[:120]
    return GoogleIdentity(sub=str(claims["sub"]), email=email, name=name or "Driver", picture=claims.get("picture"))


def sign_in_with_google(db: Session, identity: GoogleIdentity) -> User:
    user = db.scalar(select(User).where(User.google_sub == identity.sub))
    if user is None:
        user = db.scalar(select(User).where(User.email == identity.email))
        if user is not None:
            if user.google_sub and user.google_sub != identity.sub:
                # The email belongs to an account already linked to a *different* Google account.
                raise AuthError("This email is linked to a different Google account", status_code=409)
            user.google_sub = identity.sub  # link the existing account
        else:
            user = User(
                email=identity.email,
                full_name=identity.name if len(identity.name) >= 2 else "Driver",
                hashed_password=None,
                google_sub=identity.sub,
                role=UserRole.BUYER,  # buyers can switch to selling from the Sell page
                # Set explicitly: column defaults only apply at INSERT, and the active
                # check below runs before the flush (it would see None).
                is_active=True,
            )
            db.add(user)
        if not user.avatar_url and identity.picture:
            user.avatar_url = identity.picture[:500]
        user.is_verified = True  # Google verified the email address

    if not user.is_active:
        db.rollback()
        raise AuthError("This account has been deactivated", status_code=403)
    user.last_login_at = utcnow()
    try:
        db.commit()
    except IntegrityError:  # two first-time sign-ins racing: the other one created the user
        db.rollback()
        user = db.scalar(select(User).where(User.google_sub == identity.sub))
        if user is None:
            raise AuthError("Couldn't complete Google sign-in, please try again", status_code=409) from None
    db.refresh(user)
    return user
