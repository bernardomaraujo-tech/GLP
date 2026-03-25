
from __future__ import annotations

import csv
import io
import json
import math
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "stations.json"

LIST_URL = "https://www.glpautogas.info/data/lpg-stations-list-portugal.html"
PRICE_URL = "https://www.glpautogas.info/pt/preco-venda-gpl-portugal.html"

# Fallback geocodes for stations that should be visible on first run if source pages temporarily fail.
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
    }
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
    normalized = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode("ascii")
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", normalized.lower()).strip("-")
    return normalized or "station"


def norm_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode("ascii").lower()
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


def request_html(url: str) -> str:
    response = requests.get(
        url,
        timeout=40,
        headers={
            "User-Agent": "Mozilla/5.0 GPL-Portugal-App/1.0",
            "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
        },
    )
    response.raise_for_status()
    return response.text


def parse_list_page(html: str) -> pd.DataFrame:
    tables = pd.read_html(io.StringIO(html))
    for table in tables:
        columns = [str(col).strip().lower() for col in table.columns]
        if {"nome", "municipio", "marca", "distrito"}.issubset(set(columns)):
            table.columns = [str(col).strip() for col in table.columns]
            return table
    raise RuntimeError("Não foi possível encontrar a tabela de lista de postos.")


def parse_price_page(html: str) -> pd.DataFrame:
    tables = pd.read_html(io.StringIO(html))
    for table in tables:
        columns = [str(col).strip().lower() for col in table.columns]
        if {"city", "name", "brand", "price"}.issubset(set(columns)):
            table.columns = [str(col).strip() for col in table.columns]
            return table
    raise RuntimeError("Não foi possível encontrar a tabela de preços.")


def geocode_portugal(query: str) -> tuple[float | None, float | None]:
    if not query.strip():
        return None, None

    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": query,
        "format": "jsonv2",
        "limit": 1,
        "countrycodes": "pt",
    }
    response = requests.get(
        url,
        params=params,
        timeout=25,
        headers={
            "User-Agent": "Mozilla/5.0 GPL-Portugal-App/1.0",
            "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
        },
    )
    response.raise_for_status()
    data = response.json()
    if not data:
        return None, None
    return safe_float(data[0].get("lat")), safe_float(data[0].get("lon"))


def merge_sources(loc_df: pd.DataFrame, price_df: pd.DataFrame) -> list[Station]:
    records: list[Station] = []
    now_date = datetime.now().strftime("%Y-%m-%d")

    prices = []
    for _, row in price_df.iterrows():
        prices.append(
            {
                "price_name": str(row.get("Name", "")).strip(),
                "price_brand": str(row.get("Brand", "")).strip(),
                "price_city": str(row.get("City", "")).strip(),
                "price_value": safe_float(row.get("Price")),
            }
        )

    for _, row in loc_df.iterrows():
        name = str(row.get("Nome", "")).strip()
        municipality = str(row.get("Municipio", "")).strip()
        brand = str(row.get("Marca", "")).strip()
        district = str(row.get("Distrito", "")).strip()
        address = str(row.get("Morada", "")).strip()
        locality = str(row.get("Localidade", "")).strip()
        postal_code = str(row.get("CodPostal", "")).strip()

        key_name = norm_text(name)
        key_brand = norm_text(brand)
        key_city = norm_text(municipality)

        matched_price = None
        best_score = -1

        for candidate in prices:
            score = 0
            if key_brand and key_brand == norm_text(candidate["price_brand"]):
                score += 3
            if key_city and key_city == norm_text(candidate["price_city"]):
                score += 3

            candidate_name = norm_text(candidate["price_name"])
            if key_name and candidate_name:
                if key_name == candidate_name:
                    score += 6
                elif key_name in candidate_name or candidate_name in key_name:
                    score += 3

            if score > best_score:
                best_score = score
                matched_price = candidate

        price = matched_price["price_value"] if matched_price and best_score >= 6 else None

        geocode_query = ", ".join(part for part in [name, address, locality or municipality, district, "Portugal"] if part)
        lat, lon = geocode_portugal(geocode_query)

        station = Station(
            id=slugify(f"{brand}-{name}-{municipality}"),
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
        records.append(station)

    if not records:
        records = [Station(**row) for row in FALLBACK_STATIONS]

    return records


def main() -> None:
    html_list = request_html(LIST_URL)
    html_price = request_html(PRICE_URL)

    loc_df = parse_list_page(html_list)
    price_df = parse_price_page(html_price)

    stations = merge_sources(loc_df, price_df)
    stations.sort(key=lambda item: (item.district, item.municipality, item.brand, item.name))

    payload = {
        "generatedAt": datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M"),
        "sourceSummary": "Fonte: glpautogas.info (lista de postos + página pública de preços por posto)",
        "stations": [item.to_dict() for item in stations],
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Gerado {OUTPUT} com {len(stations)} postos.")


if __name__ == "__main__":
    main()
