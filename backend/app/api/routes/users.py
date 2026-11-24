"""/api/users: current profile, profile updates, password change, public profiles."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.models import User, UserRole
from app.schemas.listing import ListingCard
from app.schemas.user import PasswordChange, PublicUser, UserRead, UserUpdate
from app.services import auth_service, listing_service
from app.services.auth_service import AuthError

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserRead)
def read_me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserRead)
def update_me(
    payload: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> User:
    data = payload.model_dump(exclude_unset=True)
    if "full_name" in data and data["full_name"] is None:
        raise HTTPException(status_code=422, detail="Full name cannot be empty")
    for field, value in data.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def change_my_password(
    request: Request,
    payload: PasswordChange,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Change password and revoke every refresh token (logs out other devices)."""
    try:
        auth_service.change_password(db, user, payload.current_password, payload.new_password)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/me/become-seller", response_model=UserRead)
def become_seller(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    """Upgrade a buyer account so it can list cars (sellers can still buy and bid).
    Admins keep their role. Only buyer -> seller is possible; never to admin."""
    if user.role == UserRole.BUYER:
        user.role = UserRole.SELLER
        db.commit()
        db.refresh(user)
    return user


@router.get("/me/listings", response_model=list[ListingCard])
def my_listings(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[ListingCard]:
    """Every listing I own, in any status (pending, active, sold...)."""
    return listing_service.user_listings(db, user)


@router.get("/me/favorites", response_model=list[ListingCard])
def my_favorites(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[ListingCard]:
    return listing_service.user_favorites(db, user)


@router.get("/{user_id}", response_model=PublicUser)
def read_public_profile(user_id: int, db: Session = Depends(get_db)) -> User:
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=404, detail="User not found")
    return user
