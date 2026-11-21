"""Clean the public Kaggle 'Vehicle dataset from CarDekho' into the training schema.

Dataset: https://www.kaggle.com/datasets/nehalbirla/vehicle-dataset-from-cardekho
Files used (whichever is present): "Car details v3.csv" or "CAR DETAILS FROM CAR DEKHO.csv",
both with columns: name, year, selling_price, km_driven, fuel, seller_type, transmission, owner.

It's Indian and priced in INR (a good fit), but it lacks body type, condition and city:
  * make/model  <- parsed from `name` ("Maruti Swift Dzire VDI" -> Maruti Suzuki / Swift)
  * body_type   <- looked up from the model name, else "unknown"
  * condition   <- inferred from ownership history and age
  * location    <- "unknown"
The listings were scraped around 2020. So that "year" means the same thing as in
today's data, we shift years forward by (today - DATASET_YEAR), keeping each car's
age, and inflate prices ~5%/year.
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pandas as pd

from .schema import COLUMNS, UNKNOWN, normalise_frame

DATASET_YEAR = 2020
ANNUAL_PRICE_INFLATION = 0.05

CANDIDATE_FILES = ["Car details v3.csv", "CAR DETAILS FROM CAR DEKHO.csv", "car data.csv"]

MAKE_ALIASES = {
    "maruti": "maruti suzuki", "land": "land rover", "mercedes-benz": "mercedes-benz", "mercedes": "mercedes-benz",
    "mg": "mg", "mini": "mini", "rolls-royce": "rolls-royce", "isuzu": "isuzu", "ashok": "ashok leyland",
    "opelcorsa": "opel", "daewoo": "daewoo",
}
TWO_WORD_MAKES = {"land": "rover", "ashok": "leyland"}

# Body types for common Indian models (lower-case model token -> body).
BODY_BY_MODEL = {
    "alto": "hatchback", "wagon": "hatchback", "swift": "hatchback", "baleno": "hatchback", "celerio": "hatchback",
    "ritz": "hatchback", "ignis": "hatchback", "s-presso": "hatchback", "zen": "hatchback", "estilo": "hatchback",
    "a-star": "hatchback", "800": "hatchback", "omni": "van", "eeco": "van", "dzire": "sedan", "ciaz": "sedan",
    "sx4": "sedan", "esteem": "sedan", "ertiga": "minivan", "xl6": "minivan", "vitara": "suv", "brezza": "suv",
    "gypsy": "suv", "s-cross": "suv", "i10": "hatchback", "grand": "hatchback", "i20": "hatchback",
    "santro": "hatchback", "eon": "hatchback", "getz": "hatchback", "verna": "sedan", "accent": "sedan",
    "elantra": "sedan", "xcent": "sedan", "aura": "sedan", "creta": "suv", "venue": "suv", "tucson": "suv",
    "santa": "suv", "kona": "suv", "indica": "hatchback", "tiago": "hatchback", "bolt": "hatchback",
    "nano": "hatchback", "altroz": "hatchback", "zest": "sedan", "tigor": "sedan", "indigo": "sedan",
    "nexon": "suv", "harrier": "suv", "hexa": "suv", "safari": "suv", "sumo": "suv", "punch": "suv",
    "scorpio": "suv", "xuv500": "suv", "xuv300": "suv", "xuv700": "suv", "bolero": "suv", "thar": "suv",
    "tuv": "suv", "kuv": "suv", "marazzo": "minivan", "xylo": "minivan", "quanto": "suv", "verito": "sedan",
    "city": "sedan", "amaze": "sedan", "civic": "sedan", "accord": "sedan", "jazz": "hatchback", "brio": "hatchback",
    "wr-v": "suv", "br-v": "suv", "cr-v": "suv", "mobilio": "minivan", "innova": "minivan", "fortuner": "suv",
    "corolla": "sedan", "etios": "sedan", "camry": "sedan", "glanza": "hatchback", "yaris": "sedan",
    "qualis": "minivan", "land": "suv", "polo": "hatchback", "vento": "sedan", "ameo": "sedan", "jetta": "sedan",
    "passat": "sedan", "tiguan": "suv", "rapid": "sedan", "octavia": "sedan", "superb": "sedan", "laura": "sedan",
    "fabia": "hatchback", "kodiaq": "suv", "yeti": "suv", "kwid": "hatchback", "duster": "suv", "triber": "minivan",
    "lodgy": "minivan", "pulse": "hatchback", "scala": "sedan", "micra": "hatchback", "sunny": "sedan",
    "terrano": "suv", "kicks": "suv", "figo": "hatchback", "aspire": "sedan", "fiesta": "sedan", "ecosport": "suv",
    "endeavour": "suv", "freestyle": "hatchback", "ikon": "sedan", "seltos": "suv", "sonet": "suv",
    "carnival": "minivan", "hector": "suv", "compass": "suv", "beat": "hatchback", "spark": "hatchback",
    "cruze": "sedan", "sail": "sedan", "enjoy": "minivan", "tavera": "minivan", "captiva": "suv",
    "punto": "hatchback", "linea": "sedan", "redi-go": "hatchback", "go": "hatchback",
    "x1": "suv", "x3": "suv", "x5": "suv", "3": "sedan", "5": "sedan", "7": "sedan", "a4": "sedan", "a6": "sedan",
    "q3": "suv", "q5": "suv", "q7": "suv", "e-class": "sedan", "c-class": "sedan", "gla": "suv", "glc": "suv",
    "gle": "suv", "s-class": "sedan", "b": "hatchback", "a": "sedan", "xc60": "suv", "xc90": "suv", "s60": "sedan",
    "cooper": "hatchback", "discovery": "suv", "range": "suv", "xf": "sedan", "xe": "sedan", "f-pace": "suv",
    "mu-x": "suv", "d-max": "pickup", "lancer": "sedan", "pajero": "suv", "outlander": "suv",
}


def _parse_name(name: str) -> tuple[str, str]:
    tokens = str(name).strip().split()
    if not tokens:
        return UNKNOWN, UNKNOWN
    first = tokens[0].lower()
    rest = tokens[1:]
    if first in TWO_WORD_MAKES and rest and rest[0].lower() == TWO_WORD_MAKES[first]:
        rest = rest[1:]
    make = MAKE_ALIASES.get(first, first)
    model = rest[0].lower() if rest else UNKNOWN
    return make, model


def _condition(owner: str, age: int) -> str:
    owner = str(owner).lower()
    if "test drive" in owner:
        return "excellent"
    if owner.startswith("first"):
        return "excellent" if age <= 3 else "good"
    if owner.startswith("second"):
        return "good" if age <= 6 else "fair"
    return "fair" if age <= 10 else "poor"


def find_raw_file(raw_dir: Path) -> Path | None:
    for name in CANDIDATE_FILES:
        matches = list(raw_dir.rglob(name))
        if matches:
            return matches[0]
    return None


def clean(raw: pd.DataFrame, reference_year: int | None = None) -> pd.DataFrame:
    """Map raw CarDekho rows to the training schema (see module docstring)."""
    required = {"name", "year", "selling_price", "km_driven", "fuel", "transmission", "owner"}
    missing = required - set(raw.columns)
    if missing:
        raise ValueError(f"Not a CarDekho file, missing columns: {sorted(missing)}")

    this_year = reference_year or date.today().year
    shift = max(0, this_year - DATASET_YEAR)
    df = raw.drop_duplicates().copy()
    parsed = df["name"].map(_parse_name)
    df["make"] = parsed.map(lambda p: p[0])
    df["model"] = parsed.map(lambda p: p[1])
    year = pd.to_numeric(df["year"], errors="coerce")
    age = (DATASET_YEAR - year).clip(lower=0)

    out = pd.DataFrame({
        "make": df["make"],
        "model": df["model"],
        "year": year + shift,  # same age, expressed in today's terms
        "mileage": pd.to_numeric(df["km_driven"], errors="coerce"),
        "fuel_type": df["fuel"].astype(str).str.lower().str.strip(),
        "transmission": df["transmission"].astype(str).str.lower().str.strip(),
        "body_type": df["model"].map(lambda m: BODY_BY_MODEL.get(m, UNKNOWN)),
        "condition": [_condition(o, int(a) if pd.notna(a) else 10) for o, a in zip(df["owner"], age)],
        "location": UNKNOWN,
        "price": pd.to_numeric(df["selling_price"], errors="coerce") * (1 + ANNUAL_PRICE_INFLATION) ** shift,
    }, columns=COLUMNS)
    out = out[out["fuel_type"].isin({"petrol", "diesel", "cng", "lpg", "electric"})]
    out = out[out["transmission"].isin({"manual", "automatic"})]
    cleaned = normalise_frame(out)
    cleaned["price"] = (cleaned["price"] / 1_000).round() * 1_000
    return cleaned
