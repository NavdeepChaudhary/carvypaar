"""Engine and session factory. All queries go through the SQLAlchemy ORM /
Core with bound parameters, which protects against SQL injection."""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


def enable_sqlite_foreign_keys(engine: Engine) -> None:
    """SQLite ignores FOREIGN KEY constraints unless enabled per connection."""

    @event.listens_for(engine, "connect")
    def _set_pragma(dbapi_conn, _record) -> None:  # type: ignore[no-untyped-def]
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def build_engine(url: str) -> Engine:
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True, echo=settings.DB_ECHO)
    if url.startswith("sqlite"):
        enable_sqlite_foreign_keys(engine)
    return engine


engine = build_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def new_session() -> Session:
    """Open a session from the *current* factory. Code outside request handlers
    (WebSockets, background tasks) uses this; tests swap `SessionLocal`."""
    return SessionLocal()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a request-scoped session."""
    db = new_session()
    try:
        yield db
    finally:
        db.close()
