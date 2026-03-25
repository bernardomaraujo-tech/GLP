from __future__ import annotations

import io
import json
import re
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
OUTPUT = DATA_DIR / "stations.json"
GEOCODE_CACHE_FILE = DATA_DIR / "geocode_cache.json"

LIST_URL = "https://www.glpautogas.info/data/lpg-stations-list-portugal.html"
PRICE_URL = "https://www.glpautogas.info/pt/preco-venda-gpl-portugal.html"

USER_AGENT = "GPL-Portugal-App/1.0 (GitHub Actions)"

# Limite por execução para não abusar do geocoder
MAX_GEOCODES_PER_RUN = 15
GEOCODE_SLEEP_SECONDS = 1.2

FALLBACK_STATIONS = [
    {
        "id": "repsol-estoril",
        "name": "Repsol Estoril",
        "brand": "REPSOL",
        "district": "Lisboa",
        "municipality": "Cascais",
        "locality": "Estoril",
        "address": "Estoril",
        "postalCode": "2765-000",
        "lat": 38.705,
        "lon": -9.397,
        "price": 0.890,
        "updated": datetime.now().strftime("%Y-%m-%d"),
        "source": "fallback",
        "sourcePrice": "fallback",
        "sourceLocation": "fallback",
    },
    {
        "id": "bp-padre-cruz",
        "name": "BP AV. PADRE CRUZ",
        "brand": "BP",
        "district": "Lisboa",
        "municipality": "Lisboa",
        "locality": "Lisboa",
        "address": "Av. Padre Cruz",
        "postalCode": "1600-000",
        "lat": 38.7762,
        "lon": -9.1604,
        "price": 0.929,
        "updated": datetime.now().strftime("%Y-%m-%d"),
        "source": "fallback",
        "sourcePrice": "fallback",
        "sourceLocation": "fallback",
    },
    {
        "id": "galp-porto",
        "name": "Galp Porto",
        "brand": "GALP",
        "district": "Porto",
        "municipality": "Porto",
        "locality": "Porto",
        "address": "Porto",
        "postalCode": "4000-000",
        "lat": 41.1579,
        "lon": -8.6291,
        "price": 0.899,
        "updated": datetime.now().strftime("%Y-%m-%d"),
        "source": "fallback",
        "sourcePrice": "fallback",
        "sourceLocation": "fallback",
    },
    {
        "id": "repsol-faro",
        "name": "Repsol Faro",
        "brand": "REPSOL",
        "district": "Faro",
        "municipality": "Faro",
        "locality": "Faro",
        "address": "Faro",
        "postalCode": "8000-000",
        "lat": 37.0194,
        "lon": -7.9304,
        "price": 0.905,
        "updated": datetime.now().strftime("%Y-%m-%d"),
        "source": "fallback",
        "sourcePrice": "fallback",
        "sourceLocation": "fallback",
    },
]


@dataclass
class Station:
    id: str
    name: str
    brand: str
    district: str
    municipality: str
    locality: str
    address: str
    postalCode: str
    lat: float | None
    lon: float | None
    price: float | None
    updated: str
    source: str
    sourcePrice: str
    sourceLocation: str

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "brand": self.brand,
            "district": self.district,
            "municipality": self.municipality,
            "locality": self.locality,
            "address": self.address,
            "postalCode": self.postalCode,
            "lat": self.lat,
            "lon": self.lon,
            "price": self.price,
            "updated": self.updated,
            "source": self.source,
            "sourcePrice": self.sourcePrice,
            "sourceLocation": self.sourceLocation,
        }


def slugify(value: str) -> str:
    normalized = (
        unicodedata.normalize("NFKD", value or "")
        .encode("ascii", "ignore")
        .decode("ascii")
    )
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", normalized.lower()).strip("-")
    return normalized or "station"


def norm_text(value: str) -> str:
    value = (
        unicodedata.normalize("NFKD", value or "")
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def safe_float(value) -> float | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", ".")
    if text in {"", "nan", "na", "none", "null"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, payload: dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def request_html(url: str) -> str:
    response = requests.get(
        url,
        timeout=40,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
        },
    )
    response.raise_for_status()
    return response.text


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    renamed = {}
    for col in df.columns:
        key = norm_text(str(col))
        renamed[col] = key
    out = df.rename(columns=renamed).copy()
    return out


def parse_list_page(html: str) -> pd.DataFrame:
    tables = pd.read_html(io.StringIO(html))
    for table in tables:
        df = normalize_columns(table)
        if {"nome", "municipio", "marca", "distrito"}.issubset(df.columns):
            return df
    raise RuntimeError("Não foi possível encontrar a tabela de lista de postos.")


def parse_price_page(html: str) -> pd.DataFrame:
    tables = pd.read_html(io.StringIO(html))
    for table in tables:
        df = normalize_columns(table)
        if {"city", "name", "brand", "price"}.issubset(df.columns):
            return df
    raise RuntimeError("Não foi possível encontrar a tabela de preços.")


def geocode_portugal(query: str) -> tuple[float | None, float | None]:
    if not query.strip():
        return None, None

    response = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={
            "q": query,
            "format": "jsonv2",
            "limit": 1,
            "countrycodes": "pt",
        },
        timeout=25,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
        },
    )
    response.raise_for_status()
    data = response.json()
    if not data:
        return None, None
    return safe_float(data[0].get("lat")), safe_float(data[0].get("lon"))


def best_price_match(name: str, brand: str, municipality: str, price_rows: list[dict]) -> float | None:
    key_name = norm_text(name)
    key_brand = norm_text(brand)
    key_city = norm_text(municipality)

    matched_price = None
    best_score = -1

    for candidate in price_rows:
        score = 0

        candidate_brand = norm_text(candidate["brand"])
        candidate_city = norm_text(candidate["city"])
        candidate_name = norm_text(candidate["name"])

        if key_brand and key_brand == candidate_brand:
            score += 3
        if key_city and key_city == candidate_city:
            score += 3
        if key_name and candidate_name:
            if key_name == candidate_name:
                score += 6
            elif key_name in candidate_name or candidate_name in key_name:
                score += 3

        if score > best_score:
            best_score = score
            matched_price = candidate

    if matched_price and best_score >= 6:
        return matched_price["price"]
    return None


def deduplicate_stations(stations: list[Station]) -> list[Station]:
    seen = set()
    unique = []

    for station in stations:
        key = (
            norm_text(station.brand),
            norm_text(station.name),
            norm_text(station.municipality),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(station)

    return unique


def merge_sources(
    loc_df: pd.DataFrame,
    price_df: pd.DataFrame,
    geocode_cache: dict[str, dict],
) -> tuple[list[Station], int]:
    records: list[Station] = []
    now_date = datetime.now().strftime("%Y-%m-%d")
    geocoded_this_run = 0

    price_rows = []
    for _, row in price_df.iterrows():
        price_rows.append(
            {
                "name": str(row.get("name", "")).strip(),
                "brand": str(row.get("brand", "")).strip(),
                "city": str(row.get("city", "")).strip(),
                "price": safe_float(row.get("price")),
            }
        )

    for _, row in loc_df.iterrows():
        name = str(row.get("nome", "")).strip()
        municipality = str(row.get("municipio", "")).strip()
        brand = str(row.get("marca", "")).strip()
        district = str(row.get("distrito", "")).strip()
        address = str(row.get("morada", "")).strip()
        locality = str(row.get("localidade", "")).strip()
        postal_code = str(row.get("codpostal", "") or row.get("cod postal", "") or "").strip()

        if not name:
            continue

        station_id = slugify(f"{brand}-{name}-{municipality}")
        geocode_key = norm_text(" | ".join([name, address, locality or municipality, district]))

        lat = None
        lon = None

        cached = geocode_cache.get(geocode_key)
        if cached:
            lat = safe_float(cached.get("lat"))
            lon = safe_float(cached.get("lon"))
        elif geocoded_this_run < MAX_GEOCODES_PER_RUN:
            query = ", ".join(
                part for part in [name, address, locality or municipality, district, "Portugal"] if part
            )
            try:
                lat, lon = geocode_portugal(query)
                geocode_cache[geocode_key] = {"lat": lat, "lon": lon, "query": query}
                geocoded_this_run += 1
                time.sleep(GEOCODE_SLEEP_SECONDS)
            except Exception:
                lat, lon = None, None

        price = best_price_match(name, brand, municipality, price_rows)

        records.append(
            Station(
                id=station_id,
                name=name,
                brand=brand,
                district=district,
                municipality=municipality,
                locality=locality,
                address=address,
                postalCode=postal_code,
                lat=lat,
                lon=lon,
                price=price,
                updated=now_date,
                source="merged",
                sourcePrice="glpautogas-price-page" if price is not None else "",
                sourceLocation="glpautogas-list-page",
            )
        )

    records = deduplicate_stations(records)

    if not records:
        records = [Station(**row) for row in FALLBACK_STATIONS]

    return records, geocoded_this_run


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    geocode_cache = load_json(GEOCODE_CACHE_FILE, {})

    try:
        html_list = request_html(LIST_URL)
        html_price = request_html(PRICE_URL)

        loc_df = parse_list_page(html_list)
        price_df = parse_price_page(html_price)

        stations, geocoded_count = merge_sources(loc_df, price_df, geocode_cache)
        stations.sort(key=lambda item: (item.district, item.municipality, item.brand, item.name))

        save_json(GEOCODE_CACHE_FILE, geocode_cache)

        payload = {
            "generatedAt": datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M"),
            "sourceSummary": "Fonte: glpautogas.info (lista de postos + página pública de preços por posto)",
            "stats": {
                "totalStations": len(stations),
                "withCoordinates": sum(1 for s in stations if s.lat is not None and s.lon is not None),
                "withPrice": sum(1 for s in stations if s.price is not None),
                "geocodedThisRun": geocoded_count,
            },
            "stations": [item.to_dict() for item in stations],
        }
    except Exception as exc:
        payload = {
            "generatedAt": datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M"),
            "sourceSummary": f"Fallback local devido a erro no pipeline: {exc}",
            "stats": {
                "totalStations": len(FALLBACK_STATIONS),
                "withCoordinates": len(FALLBACK_STATIONS),
                "withPrice": len(FALLBACK_STATIONS),
                "geocodedThisRun": 0,
            },
            "stations": FALLBACK_STATIONS,
        }

    save_json(OUTPUT, payload)
    print(f"Gerado {OUTPUT} com {len(payload['stations'])} postos.")


if __name__ == "__main__":
    main()
