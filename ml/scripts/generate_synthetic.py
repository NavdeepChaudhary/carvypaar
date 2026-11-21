"""Generate the synthetic training dataset.

    python scripts/generate_synthetic.py --rows 25000 --seed 42
Writes ml/data/processed/synthetic.csv
"""
from __future__ import annotations

import argparse

import _bootstrap  # noqa: F401

from carvypaar_ml.schema import SYNTHETIC_CSV, normalise_frame
from carvypaar_ml.synthetic import generate


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rows", type=int, default=25_000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", default=str(SYNTHETIC_CSV))
    args = parser.parse_args()
    if not 500 <= args.rows <= 2_000_000:
        parser.error("--rows must be between 500 and 2,000,000")

    df = normalise_frame(generate(args.rows, args.seed))
    SYNTHETIC_CSV.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.out, index=False)
    print(f"Wrote {len(df):,} rows to {args.out}")
    print(df.describe(include="all").loc[["count", "unique", "mean", "min", "max"]].T.to_string())


if __name__ == "__main__":
    main()
