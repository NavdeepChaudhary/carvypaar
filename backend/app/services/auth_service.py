"""Auth business logic, kept separate from HTTP concerns so it is easy to test."""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    dummy_verify,
    ensure_aware,
    hash_password,
    utcnow,
    verify_password,
)
from app.models import RefreshToken, User, UserRole


class AuthError(Exception):
    """Domain error carrying an HTTP status code and a user-safe message."""

    def __init__(self, message: str, status_code: int = 401) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.lower()))


def register_user(
    db: Session, *, email: str, password: str, full_name: str, role: UserRole, phone: str | None = None
) -> User:
    if get_user_by_email(db, email):
        raise AuthError("An account with this email already exists", status_code=409)
    user = User(
        email=email.lower(),
        hashed_password=hash_password(password),
        full_name=full_name,
        role=role,
        phone=phone,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    user = get_user_by_email(db, email)
    if user is None:
        dummy_verify()  # constant-ish time to avoid account enumeration
        raise AuthError("Incorrect email or password")
    if user.hashed_password is None:
        # Google-only account: same generic error (no hint that the account exists).
        dummy_verify()
        raise AuthError("Incorrect email or password")
    if not verify_password(password, user.hashed_password):
        raise AuthError("Incorrect email or password")
    if not user.is_active:
        raise AuthError("This account has been deactivated", status_code=403)
    user.last_login_at = utcnow()
    db.commit()
    return user


def issue_token_pair(
    db: Session, user: User, *, user_agent: str | None = None, ip: str | None = None
) -> tuple[str, int, str, RefreshToken]:
    """Create an access token + a persisted refresh token.
    Returns (access_token, expires_in, refresh_token, refresh_row)."""
    access, expires_in = create_access_token(user.id, user.role.value)
    refresh, jti, expires_at = create_refresh_token(user.id)
    row = RefreshToken(
        jti=jti,
        user_id=user.id,
        expires_at=expires_at,
        user_agent=(user_agent or "")[:255] or None,
        ip_address=(ip or "")[:64] or None,
    )
    db.add(row)
    db.commit()
    return access, expires_in, refresh, row


def revoke_all_user_tokens(db: Session, user_id: int) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    db.commit()


def rotate_refresh_token(db: Session, token: str) -> User:
    """Validate a refresh token and revoke it (caller then issues a new pair).

    Reuse detection: if a token that was already rotated is presented again
    (outside a short grace window for benign races), we assume it was stolen
    and revoke every session for that user.
    """
    try:
        claims = decode_token(token, expected_type="refresh")
    except TokenError as exc:
        raise AuthError(str(exc)) from None

    row = db.scalar(select(RefreshToken).where(RefreshToken.jti == claims["jti"]))
    if row is None:
        raise AuthError("Invalid refresh token")

    now = utcnow()
    if row.revoked_at is not None:
        grace = timedelta(seconds=settings.REFRESH_REUSE_GRACE_SECONDS)
        if now - ensure_aware(row.revoked_at) > grace:
            revoke_all_user_tokens(db, row.user_id)
        raise AuthError("Refresh token has been revoked")
    if ensure_aware(row.expires_at) <= now:
        raise AuthError("Refresh token has expired")

    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise AuthError("Account unavailable")

    row.revoked_at = now
    db.commit()
    return user


def revoke_refresh_token(db: Session, token: str) -> None:
    """Best-effort revoke used by logout; silently ignores bad tokens."""
    try:
        claims = decode_token(token, expected_type="refresh")
    except TokenError:
        return
    row = db.scalar(select(RefreshToken).where(RefreshToken.jti == claims["jti"]))
    if row is not None and row.revoked_at is None:
        row.revoked_at = utcnow()
        db.commit()


def change_password(db: Session, user: User, current: str | None, new: str) -> None:
    if user.hashed_password is not None:
        if not current or not verify_password(current, user.hashed_password):
            raise AuthError("Current password is incorrect", status_code=400)
        if verify_password(new, user.hashed_password):
            raise AuthError("New password must be different from the current one", status_code=400)
    # else: a Google-only account is setting its first password (it's already signed in).
    user.hashed_password = hash_password(new)
    db.commit()
    revoke_all_user_tokens(db, user.id)  # sign out every other session
