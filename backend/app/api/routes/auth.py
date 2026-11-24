"""/api/auth: register, login, refresh (rotating), logout.

Browsers get the refresh token as an httpOnly, SameSite=Lax cookie scoped to
/api/auth, so JavaScript can never read it. The access token is returned in the
body and kept in memory by the frontend. The refresh token is also returned in
the body for non-browser clients (mobile apps, scripts, tests).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.lockout import throttle
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.models import User, UserRole
from app.schemas.auth import AuthProviders, GoogleAuthRequest, LoginRequest, RefreshRequest, RegisterRequest, TokenResponse
from app.schemas.user import UserRead
from app.services import auth_service, google_auth
from app.services.auth_service import AuthError

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "cv_refresh"
_COOKIE_PATH = f"{settings.API_PREFIX}/auth"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        path=_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path=_COOKIE_PATH, httponly=True, samesite="lax",
                           secure=settings.COOKIE_SECURE)


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _token_response(db: Session, user: User, request: Request, response: Response) -> TokenResponse:
    access, expires_in, refresh, _ = auth_service.issue_token_pair(
        db, user, user_agent=request.headers.get("user-agent"), ip=_client_ip(request)
    )
    _set_refresh_cookie(response, refresh)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=expires_in,
        user=UserRead.model_validate(user),
    )


def _http_error(exc: AuthError) -> HTTPException:
    headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
    return HTTPException(status_code=exc.status_code, detail=exc.message, headers=headers)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def register(
    request: Request, response: Response, payload: RegisterRequest, db: Session = Depends(get_db)
) -> TokenResponse:
    """Create a buyer or seller account and sign the user in immediately."""
    try:
        user = auth_service.register_user(
            db,
            email=payload.email,
            password=payload.password,
            full_name=payload.full_name,
            role=UserRole(payload.role),
            phone=payload.phone,
        )
    except AuthError as exc:
        raise _http_error(exc) from None
    return _token_response(db, user, request, response)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(
    request: Request, response: Response, payload: LoginRequest, db: Session = Depends(get_db)
) -> TokenResponse:
    ip = _client_ip(request)
    wait = throttle.retry_after(payload.email, ip)
    if wait:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed sign-in attempts. Try again in {max(1, wait // 60)} minute(s).",
            headers={"Retry-After": str(wait)},
        )
    try:
        user = auth_service.authenticate(db, payload.email, payload.password)
    except AuthError as exc:
        if exc.status_code == 401:
            throttle.failed(payload.email, ip)
        raise _http_error(exc) from None
    throttle.succeeded(payload.email, ip)
    return _token_response(db, user, request, response)


@router.get("/providers", response_model=AuthProviders)
def providers() -> AuthProviders:
    """Which external sign-in providers are enabled (the Google client ID is public)."""
    return AuthProviders(google_client_id=settings.GOOGLE_CLIENT_ID or None)


@router.post("/google", response_model=TokenResponse)
@limiter.limit("20/minute")
def google_sign_in(
    request: Request, response: Response, payload: GoogleAuthRequest, db: Session = Depends(get_db)
) -> TokenResponse:
    """Exchange a Google ID token for a CarvyPaar session. Creates the account on first use,
    or links an existing account with the same (Google-verified) email."""
    try:
        identity = google_auth.verify_google_credential(payload.credential)
        user = google_auth.sign_in_with_google(db, identity)
    except AuthError as exc:
        raise _http_error(exc) from None
    return _token_response(db, user, request, response)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
def refresh(
    request: Request,
    response: Response,
    payload: RefreshRequest | None = None,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Exchange a refresh token (body or cookie) for a new token pair (rotation)."""
    token = (payload.refresh_token if payload else None) or request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Missing refresh token")
    try:
        user = auth_service.rotate_refresh_token(db, token)
    except AuthError as exc:
        _clear_refresh_cookie(response)
        # HTTPException discards `response`, so attach the cookie-clearing header manually.
        headers = {"WWW-Authenticate": "Bearer", "set-cookie": response.headers["set-cookie"]}
        raise HTTPException(status_code=exc.status_code, detail=exc.message, headers=headers) from None
    return _token_response(db, user, request, response)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def logout(request: Request, payload: RefreshRequest | None = None, db: Session = Depends(get_db)) -> Response:
    token = (payload.refresh_token if payload else None) or request.cookies.get(REFRESH_COOKIE)
    if token:
        auth_service.revoke_refresh_token(db, token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response)
    return response
