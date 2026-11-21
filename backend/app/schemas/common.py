"""Shared schema building blocks."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, PlainSerializer

from app.core.security import ensure_aware

T = TypeVar("T")

MAX_PRICE = Decimal("1000000000")  # 100 crore: anything above is a typo

# SQLite returns naive datetimes; always emit explicit UTC (+00:00) so browsers parse correctly.
UtcDatetime = Annotated[
    datetime, PlainSerializer(lambda d: ensure_aware(d).isoformat(), return_type=str, when_used="json")
]

# Money is stored as Decimal (exact) but serialised to JSON as a number so the
# frontend doesn't have to parse strings.
Money = Annotated[Decimal, PlainSerializer(lambda v: float(v), return_type=float, when_used="json")]


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int
