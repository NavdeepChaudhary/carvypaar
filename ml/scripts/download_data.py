"""Download and clean the public Kaggle 'Vehicle dataset from CarDekho'.

    python scripts/download_data.py                 # download via kagglehub, then clean
    python scripts/download_data.py --input "path/to/Car details v3.csv"   # clean a manual download

Downloading needs Kaggle credentials (https://www.kaggle.com/settings -> "Create New Token"),
either ~/.kaggle/kaggle.json or the KAGGLE_USERNAME / KAGGLE_KEY environment variables.
No credentials? Download the zip from the dataset page in a browser, unzip it into
ml/data/raw/, and run this script again; it searches that folder.

Writes ml/data/processed/cardekho.csv in the training schema (see carvypaar_ml/cardekho.py).
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

import pandas as pd

import _bootstrap  # noqa: F401

from carvypaar_ml.cardekho import clean, find_raw_file
from carvypaar_ml.schema import CARDEKHO_CSV, RAW_DIR

DATASET = "nehalbirla/vehicle-dataset-from-cardekho"


def download() -> Path | None:
    try:
        import kagglehub  # optional dependency
    except ImportError:
        print("kagglehub isn't installed (pip install kagglehub).", file=sys.stderr)
        return None
    try:
        path = Path(kagglehub.dataset_download(DATASET))
    except Exception as exc:  # noqa: BLE001 - auth/network errors vary by version
        print(f"Kaggle download failed: {exc}", file=sys.stderr)
        return None
    target = RAW_DIR / "cardekho"
    target.mkdir(parents=True, exist_ok=True)
    for csv in path.rglob("*.csv"):
        shutil.copy2(csv, target / csv.name)
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", type=Path, help="A CarDekho CSV you downloaded manually")
    parser.add_argument("--skip-download", action="store_true", help="Only look in ml/data/raw")
    args = parser.parse_args()

    source = args.input
    if source is None:
        source = find_raw_file(RAW_DIR)
        if source is None and not args.skip_download:
            print(f"Downloading {DATASET} from Kaggle...")
            folder = download()
            source = find_raw_file(folder) if folder else None
    if source is None or not source.exists():
        print(
            "\nNo CarDekho CSV found. Either set up Kaggle credentials, or download it manually:\n"
            f"  https://www.kaggle.com/datasets/{DATASET}\n"
            f"  unzip into {RAW_DIR} and re-run.\n"
            "Training still works without it: train.py falls back to synthetic data.",
            file=sys.stderr,
        )
        return 1

    raw = pd.read_csv(source)
    cleaned = clean(raw)
    CARDEKHO_CSV.parent.mkdir(parents=True, exist_ok=True)
    cleaned.to_csv(CARDEKHO_CSV, index=False)
    print(f"Read {len(raw):,} rows from {source.name}; kept {len(cleaned):,} after cleaning -> {CARDEKHO_CSV}")
    print("Body type unknown for", f"{(cleaned['body_type'] == 'unknown').mean():.0%}", "of rows")
    print(cleaned.groupby("make").size().sort_values(ascending=False).head(10).to_string())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
