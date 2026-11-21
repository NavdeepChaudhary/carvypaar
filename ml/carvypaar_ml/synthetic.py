"""Synthetic Indian used-car market (fallback / complement to the Kaggle data).

Prices come from an explicit, documented market model, so the data has every
feature the app collects (unlike public datasets, which lack body type,
condition and city):

    price = new_price
          × brand_retention ^ age             (luxury brands depreciate faster)
          × mileage factor                     (vs ~11,000 km/year expected)
          × condition × fuel × transmission × city factor
          × log-normal market noise (σ ≈ 8%)

Because the generating process is known, a good model should reach a high R² on
this data. Treat synthetic metrics as a pipeline sanity check, not as real-world
accuracy.
"""
from __future__ import annotations

import math
from datetime import date

import numpy as np
import pandas as pd

from .schema import COLUMNS

# (make, model, body, new price ₹, yearly value retention, fuel options {fuel: weight}, P(automatic))
CATALOG: list[tuple[str, str, str, int, float, dict[str, float], float]] = [
    ("Maruti Suzuki", "Alto", "hatchback", 400_000, 0.90, {"petrol": 0.8, "cng": 0.2}, 0.1),
    ("Maruti Suzuki", "Wagon R", "hatchback", 600_000, 0.90, {"petrol": 0.7, "cng": 0.3}, 0.2),
    ("Maruti Suzuki", "Swift", "hatchback", 750_000, 0.90, {"petrol": 0.85, "cng": 0.15}, 0.25),
    ("Maruti Suzuki", "Baleno", "hatchback", 850_000, 0.89, {"petrol": 0.9, "cng": 0.1}, 0.3),
    ("Maruti Suzuki", "Dzire", "sedan", 800_000, 0.90, {"petrol": 0.75, "cng": 0.25}, 0.25),
    ("Maruti Suzuki", "Ertiga", "minivan", 1_100_000, 0.90, {"petrol": 0.7, "cng": 0.3}, 0.3),
    ("Maruti Suzuki", "Brezza", "suv", 1_100_000, 0.90, {"petrol": 1.0}, 0.35),
    ("Maruti Suzuki", "Grand Vitara", "suv", 1_500_000, 0.89, {"petrol": 0.6, "hybrid": 0.4}, 0.5),
    ("Hyundai", "i10", "hatchback", 600_000, 0.88, {"petrol": 0.85, "cng": 0.15}, 0.2),
    ("Hyundai", "i20", "hatchback", 900_000, 0.88, {"petrol": 0.8, "diesel": 0.2}, 0.35),
    ("Hyundai", "i20 N Line", "hatchback", 1_150_000, 0.88, {"petrol": 1.0}, 0.5),
    ("Hyundai", "Venue", "suv", 1_100_000, 0.88, {"petrol": 0.7, "diesel": 0.3}, 0.4),
    ("Hyundai", "Creta", "suv", 1_700_000, 0.89, {"petrol": 0.5, "diesel": 0.5}, 0.55),
    ("Hyundai", "Verna", "sedan", 1_400_000, 0.87, {"petrol": 0.7, "diesel": 0.3}, 0.5),
    ("Hyundai", "Tucson", "suv", 3_000_000, 0.86, {"petrol": 0.4, "diesel": 0.6}, 1.0),
    ("Tata", "Tiago", "hatchback", 650_000, 0.87, {"petrol": 0.7, "cng": 0.2, "electric": 0.1}, 0.2),
    ("Tata", "Altroz", "hatchback", 850_000, 0.87, {"petrol": 0.7, "diesel": 0.2, "cng": 0.1}, 0.25),
    ("Tata", "Punch", "suv", 800_000, 0.88, {"petrol": 0.8, "electric": 0.2}, 0.3),
    ("Tata", "Nexon", "suv", 1_200_000, 0.88, {"petrol": 0.6, "diesel": 0.3, "electric": 0.1}, 0.4),
    ("Tata", "Nexon EV", "suv", 1_600_000, 0.84, {"electric": 1.0}, 1.0),
    ("Tata", "Harrier", "suv", 2_300_000, 0.87, {"diesel": 1.0}, 0.6),
    ("Tata", "Safari", "suv", 2_500_000, 0.87, {"diesel": 1.0}, 0.6),
    ("Mahindra", "Thar", "suv", 1_650_000, 0.92, {"petrol": 0.4, "diesel": 0.6}, 0.4),
    ("Mahindra", "Scorpio N", "suv", 2_000_000, 0.90, {"petrol": 0.3, "diesel": 0.7}, 0.4),
    ("Mahindra", "XUV700", "suv", 2_400_000, 0.89, {"petrol": 0.35, "diesel": 0.65}, 0.6),
    ("Mahindra", "XUV300", "suv", 1_100_000, 0.87, {"petrol": 0.5, "diesel": 0.5}, 0.3),
    ("Mahindra", "Bolero", "suv", 1_000_000, 0.90, {"diesel": 1.0}, 0.0),
    ("Honda", "Amaze", "sedan", 850_000, 0.88, {"petrol": 0.8, "diesel": 0.2}, 0.35),
    ("Honda", "City", "sedan", 1_400_000, 0.89, {"petrol": 0.85, "diesel": 0.15}, 0.5),
    ("Honda", "City e:HEV", "sedan", 2_000_000, 0.87, {"hybrid": 1.0}, 1.0),
    ("Honda", "Elevate", "suv", 1_500_000, 0.88, {"petrol": 1.0}, 0.5),
    ("Toyota", "Glanza", "hatchback", 850_000, 0.89, {"petrol": 0.85, "cng": 0.15}, 0.3),
    ("Toyota", "Innova Crysta", "minivan", 2_400_000, 0.92, {"diesel": 1.0}, 0.4),
    ("Toyota", "Innova Hycross", "minivan", 3_000_000, 0.91, {"petrol": 0.3, "hybrid": 0.7}, 1.0),
    ("Toyota", "Fortuner", "suv", 4_500_000, 0.92, {"diesel": 0.8, "petrol": 0.2}, 0.75),
    ("Toyota", "Hilux", "pickup", 3_700_000, 0.90, {"diesel": 1.0}, 0.5),
    ("Toyota", "Camry", "sedan", 4_600_000, 0.86, {"hybrid": 1.0}, 1.0),
    ("Kia", "Sonet", "suv", 1_100_000, 0.88, {"petrol": 0.65, "diesel": 0.35}, 0.4),
    ("Kia", "Seltos", "suv", 1_500_000, 0.88, {"petrol": 0.6, "diesel": 0.4}, 0.5),
    ("Kia", "Carens", "minivan", 1_500_000, 0.87, {"petrol": 0.6, "diesel": 0.4}, 0.4),
    ("Kia", "EV6", "suv", 6_500_000, 0.82, {"electric": 1.0}, 1.0),
    ("Volkswagen", "Polo", "hatchback", 800_000, 0.86, {"petrol": 0.8, "diesel": 0.2}, 0.3),
    ("Volkswagen", "Virtus", "sedan", 1_600_000, 0.87, {"petrol": 1.0}, 0.5),
    ("Volkswagen", "Taigun", "suv", 1_600_000, 0.87, {"petrol": 1.0}, 0.5),
    ("Skoda", "Slavia", "sedan", 1_500_000, 0.86, {"petrol": 1.0}, 0.5),
    ("Skoda", "Kushaq", "suv", 1_600_000, 0.86, {"petrol": 1.0}, 0.5),
    ("Skoda", "Octavia", "sedan", 2_900_000, 0.85, {"petrol": 0.7, "diesel": 0.3}, 0.9),
    ("Skoda", "Kodiaq", "suv", 4_000_000, 0.85, {"petrol": 0.5, "diesel": 0.5}, 1.0),
    ("Renault", "Kwid", "hatchback", 500_000, 0.86, {"petrol": 1.0}, 0.2),
    ("Renault", "Kiger", "suv", 800_000, 0.86, {"petrol": 1.0}, 0.3),
    ("Nissan", "Magnite", "suv", 850_000, 0.86, {"petrol": 1.0}, 0.3),
    ("MG", "Hector", "suv", 2_000_000, 0.85, {"petrol": 0.6, "diesel": 0.4}, 0.6),
    ("MG", "ZS EV", "suv", 2_300_000, 0.82, {"electric": 1.0}, 1.0),
    ("Ford", "EcoSport", "suv", 1_000_000, 0.85, {"petrol": 0.5, "diesel": 0.5}, 0.3),
    ("Ford", "Endeavour", "suv", 3_500_000, 0.87, {"diesel": 1.0}, 0.8),
    ("Ford", "Mustang GT", "coupe", 7_500_000, 0.88, {"petrol": 1.0}, 1.0),
    ("BMW", "3 Series", "sedan", 5_500_000, 0.84, {"petrol": 0.6, "diesel": 0.4}, 1.0),
    ("BMW", "M340i", "sedan", 7_500_000, 0.85, {"petrol": 1.0}, 1.0),
    ("BMW", "X1", "suv", 5_000_000, 0.84, {"petrol": 0.6, "diesel": 0.4}, 1.0),
    ("BMW", "X5", "suv", 9_800_000, 0.84, {"petrol": 0.4, "diesel": 0.6}, 1.0),
    ("BMW", "Z4", "convertible", 9_000_000, 0.86, {"petrol": 1.0}, 1.0),
    ("Mercedes-Benz", "A-Class", "sedan", 4_600_000, 0.84, {"petrol": 0.7, "diesel": 0.3}, 1.0),
    ("Mercedes-Benz", "C-Class", "sedan", 6_000_000, 0.84, {"petrol": 0.6, "diesel": 0.4}, 1.0),
    ("Mercedes-Benz", "E-Class", "sedan", 7_800_000, 0.83, {"petrol": 0.5, "diesel": 0.5}, 1.0),
    ("Mercedes-Benz", "GLC", "suv", 7_500_000, 0.84, {"petrol": 0.5, "diesel": 0.5}, 1.0),
    ("Mercedes-Benz", "AMG GT", "coupe", 25_000_000, 0.86, {"petrol": 1.0}, 1.0),
    ("Audi", "A4", "sedan", 4_700_000, 0.83, {"petrol": 1.0}, 1.0),
    ("Audi", "Q3", "suv", 4_500_000, 0.83, {"petrol": 1.0}, 1.0),
    ("Audi", "Q7", "suv", 9_000_000, 0.83, {"petrol": 0.6, "diesel": 0.4}, 1.0),
    ("Porsche", "911 Carrera", "coupe", 19_000_000, 0.91, {"petrol": 1.0}, 0.95),
    ("Porsche", "Macan", "suv", 9_000_000, 0.88, {"petrol": 1.0}, 1.0),
    ("Land Rover", "Defender", "suv", 10_000_000, 0.89, {"petrol": 0.5, "diesel": 0.5}, 1.0),
    ("Mini", "Cooper S Convertible", "convertible", 4_800_000, 0.86, {"petrol": 1.0}, 1.0),
    ("Volvo", "XC60", "suv", 6_800_000, 0.84, {"petrol": 0.6, "hybrid": 0.4}, 1.0),
    ("Jeep", "Compass", "suv", 2_400_000, 0.85, {"petrol": 0.4, "diesel": 0.6}, 0.6),
    ("Maruti Suzuki", "Eeco", "van", 550_000, 0.90, {"petrol": 0.6, "cng": 0.4}, 0.0),
    ("Skoda", "Superb", "sedan", 3_500_000, 0.84, {"petrol": 1.0}, 1.0),
    ("Volvo", "V90 Cross Country", "wagon", 6_500_000, 0.83, {"diesel": 1.0}, 1.0),
]

CITY_FACTOR = {
    "Mumbai": 1.03, "Delhi": 1.02, "Bengaluru": 1.04, "Pune": 1.01, "Hyderabad": 1.02, "Chennai": 1.01,
    "Kolkata": 0.97, "Ahmedabad": 0.99, "Jaipur": 0.97, "Chandigarh": 1.00, "Lucknow": 0.96, "Kochi": 1.00,
    "Indore": 0.96, "Nagpur": 0.95, "Coimbatore": 0.98,
}
CONDITION_FACTOR = {"new": 1.0, "excellent": 0.99, "good": 0.92, "fair": 0.82, "poor": 0.65}
FUEL_FACTOR = {"petrol": 1.0, "diesel": 1.06, "cng": 0.94, "lpg": 0.88, "hybrid": 1.08, "electric": 1.0}
AUTO_FACTOR = 1.07  # automatic vs manual, all else equal
EXPECTED_KM_PER_YEAR = 11_000


def market_price(
    new_price: float, retention: float, age: int, mileage: int, condition: str, fuel: str,
    automatic: bool, city: str,
) -> float:
    """Deterministic 'fair' price before market noise."""
    value = new_price * FUEL_FACTOR[fuel] * (AUTO_FACTOR if automatic else 1.0)
    # EVs lose value faster in today's market (battery-life worries).
    value *= (retention - (0.03 if fuel == "electric" else 0.0)) ** age
    expected_km = max(age, 0.5) * EXPECTED_KM_PER_YEAR
    value *= min(1.12, max(0.55, math.exp(-0.0000032 * (mileage - expected_km))))
    value *= math.exp(-mileage / 900_000)  # absolute wear
    value *= CONDITION_FACTOR[condition] * CITY_FACTOR[city]
    return value


def generate(n_rows: int = 25_000, seed: int = 42, reference_year: int | None = None) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    this_year = reference_year or date.today().year
    cities = list(CITY_FACTOR)
    rows: list[dict[str, object]] = []
    # Popular, affordable models appear more often, as on real marketplaces.
    weights = np.array([1 / math.sqrt(c[3]) for c in CATALOG])
    weights /= weights.sum()
    idx = rng.choice(len(CATALOG), size=n_rows, p=weights)

    for i in idx:
        make, model, body, new_price, retention, fuels, p_auto = CATALOG[i]
        age = int(min(18, rng.gamma(shape=2.0, scale=2.6)))
        year = this_year - age
        km_per_year = max(2_000, rng.normal(EXPECTED_KM_PER_YEAR, 4_500))
        mileage = int(max(0, km_per_year * max(age, 0.15) + rng.normal(0, 1_500)))
        fuel = rng.choice(list(fuels), p=np.array(list(fuels.values())) / sum(fuels.values()))
        automatic = rng.random() < p_auto
        if age == 0 and mileage < 2_000:
            condition = "new"
        else:
            wear = age / 10 + mileage / 150_000 + rng.normal(0, 0.35)
            condition = "excellent" if wear < 0.5 else "good" if wear < 1.2 else "fair" if wear < 2.0 else "poor"
        city = cities[int(rng.integers(len(cities)))]
        fair = market_price(new_price, retention, age, mileage, condition, fuel, automatic, city)
        price = fair * rng.lognormal(mean=0.0, sigma=0.08)
        rows.append({
            "make": make, "model": model, "year": year, "mileage": mileage, "fuel_type": fuel,
            "transmission": "automatic" if automatic else "manual", "body_type": body,
            "condition": condition, "location": city, "price": int(round(price / 5_000) * 5_000),
        })
    return pd.DataFrame(rows, columns=COLUMNS)
