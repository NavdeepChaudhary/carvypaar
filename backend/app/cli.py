"""Management commands.

    python -m app.cli create-admin --email admin@carvypaar.com --name "Site Admin"
    (prompts for the password if --password is omitted)
    python -m app.cli seed --count 36      # demo sellers + listings
    python -m app.cli export-training-data  # real listings -> ml/data/processed/marketplace.csv
"""
from __future__ import annotations

import argparse
import getpass
import sys

from pydantic import ValidationError
from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import User, UserRole
from app.schemas.auth import RegisterRequest


def create_admin(email: str, name: str, password: str | None) -> int:
    if password is None:
        password = getpass.getpass("Admin password: ")
        if password != getpass.getpass("Confirm password: "):
            print("Passwords do not match.", file=sys.stderr)
            return 1
    try:
        # Reuse the public validation rules (email format, password strength).
        data = RegisterRequest(email=email, password=password, full_name=name)
    except ValidationError as exc:
        print(f"Invalid input:\n{exc}", file=sys.stderr)
        return 1

    with SessionLocal() as db:
        existing = db.scalar(select(User).where(User.email == data.email))
        if existing:
            existing.role = UserRole.ADMIN
            existing.is_active = True
            db.commit()
            print(f"Promoted existing user {data.email} to admin.")
            return 0
        db.add(
            User(
                email=data.email,
                full_name=data.full_name,
                hashed_password=hash_password(data.password),
                role=UserRole.ADMIN,
                is_verified=True,
            )
        )
        db.commit()
    print(f"Created admin {data.email}.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    p_admin = sub.add_parser("create-admin", help="Create (or promote) an admin user")
    p_admin.add_argument("--email", required=True)
    p_admin.add_argument("--name", default="Administrator")
    p_admin.add_argument("--password", help="Omit to be prompted securely")

    p_seed = sub.add_parser("seed", help="Insert demo sellers and car listings")
    p_seed.add_argument("--count", type=int, default=36, help="Number of listings (1-500)")

    p_auc = sub.add_parser("seed-auctions", help="Turn some existing listings into demo auctions")
    p_auc.add_argument("--count", type=int, default=6)

    sub.add_parser("reprice-demo", help="Re-price demo listings around the current AI model's fair value")

    p_exp = sub.add_parser("export-training-data", help="Export marketplace listings for model retraining")
    p_exp.add_argument("--out", default=None, help="CSV path (default: ml/data/processed/marketplace.csv)")

    args = parser.parse_args(argv)
    if args.command == "create-admin":
        return create_admin(args.email, args.name, args.password)
    if args.command == "seed":
        return run_seed(args.count)
    if args.command == "seed-auctions":
        return run_seed_auctions(args.count)
    if args.command == "export-training-data":
        return run_export(args.out)
    if args.command == "reprice-demo":
        from app.seed import reprice_demo

        with SessionLocal() as db:
            n = reprice_demo(db)
        print(f"Re-priced {n} demo listings." if n else "No trained model found (run python ml/scripts/train.py).")
        return 0
    return 1


def run_export(out: str | None) -> int:
    from pathlib import Path

    from app.core.config import settings
    from app.services.training_export import export_training_data

    path = Path(out) if out else Path(settings.ML_DATA_DIR) / "marketplace.csv"
    with SessionLocal() as db:
        n = export_training_data(db, path)
    print(f"Exported {n} listings to {path}")
    print("Retrain with:  python ml/scripts/train.py   (the API picks up the new model automatically)")
    return 0


def run_seed(count: int) -> int:
    from app.seed import DEMO_PASSWORD, seed, seed_auctions

    if not 1 <= count <= 500:
        print("--count must be between 1 and 500", file=sys.stderr)
        return 1
    with SessionLocal() as db:
        seed(db, count)
        auctions = seed_auctions(db, min(6, count // 3))
    print(f"Seeded {count} listings ({auctions} as auctions). Demo seller logins (password: {DEMO_PASSWORD}):")
    print("  demo@carvypaar.com, torque@carvypaar.com, redline@carvypaar.com")
    return 0


def run_seed_auctions(count: int) -> int:
    from app.seed import seed_auctions

    if not 1 <= count <= 7:
        print("--count must be between 1 and 7", file=sys.stderr)
        return 1
    with SessionLocal() as db:
        made = seed_auctions(db, count)
    print(f"Created {made} demo auctions (live and upcoming).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
