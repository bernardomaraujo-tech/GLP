from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
CSV_FILE = DATA_DIR / "Postos.csv"
OUTPUT = DATA_DIR / "stations.json"


def clean_col(col: str) -> str:
    text = str(col).strip().replace("ï»¿", "").replace("\ufeff", "")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"\s+", "", text)
    return text


def read_csv_fallback(path: Path) -> pd.DataFrame:
    encodings = ["utf-8-sig", "utf-8", "latin1", "cp1252"]
    last_error = None
    for encoding in encodings:
        try:
            return pd.read_csv(path, sep=";", encoding=encoding)
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"Não foi possível ler o CSV: {last_error}")


def parse_price(value):
    if value is None:
        return None
    text = str(value).strip().replace("€", "").replace(" ", "").replace(",", ".")
    if text in {"", "nan", "na", "none", "null"}:
        return None
    try:
        return round(float(text), 3)
    except ValueError:
        return None


def parse_float(value):
    if value is None:
        return None
    text = str(value).strip().replace(",", ".")
    if text in {"", "nan", "na", "none", "null"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return text or "posto"


def normalize_brand(value: str) -> str:
    text = (value or "").strip().upper()
    mapping = {
        "GALPENERGIA": "GALP",
        "GALP ENERGIA": "GALP",
        "PRIO ENERGY": "PRIO",
        "AUCHAN RETAIL": "AUCHAN",
        "BP PORTUGAL": "BP",
        "REPSOL PORTUGUESA": "REPSOL",
        "CEPSA PORTUGUESA": "CEPSA",
    }
    return mapping.get(text, text)


def normalize_text(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode("ascii")
    text = text.lower().strip()
    text = re.sub(r"\s+", " ", text)
    return text


def zone_for_district(district: str) -> str:
    district = normalize_text(district)
    norte = {"viana do castelo","braga","porto","vila real","braganca"}
    centro = {"aveiro","viseu","guarda","coimbra","castelo branco","leiria"}
    lisboa = {"lisboa","santarem","setubal"}
    alentejo = {"portalegre","evora","beja"}
    algarve = {"faro"}

    if district in norte:
        return "Norte"
    if district in centro:
        return "Centro"
    if district in lisboa:
        return "Lisboa e Vale do Tejo"
    if district in alentejo:
        return "Alentejo"
    if district in algarve:
        return "Algarve"
    return ""


def parse_updated(value: str):
    text = str(value or "").strip()
    if not text:
        return ""
    formats = [
        "%d/%m/%Y %H:%M",
        "%d-%m-%Y %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%d/%m/%Y",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(text, fmt)
            return dt.replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    return text


def build_station_key(row: dict) -> str:
    parts = [
        normalize_brand(str(row.get("marca", ""))),
        normalize_text(str(row.get("nome", ""))),
        normalize_text(str(row.get("morada", ""))),
        normalize_text(str(row.get("codpostal", ""))),
        normalize_text(str(row.get("municipio", ""))),
    ]
    return "|".join(parts)


def main():
    if not CSV_FILE.exists():
        raise FileNotFoundError(f"CSV não encontrado: {CSV_FILE}")

    df = read_csv_fallback(CSV_FILE)
    df.columns = [clean_col(c) for c in df.columns]

    required = ["nome", "preco", "marca", "combustivel", "distrito", "municipio", "latitude", "longitude"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise RuntimeError(f"Faltam colunas obrigatórias no CSV: {missing}")

    stations = []
    seen = set()
    max_updated = None

    for _, row in df.iterrows():
        fuel = str(row.get("combustivel", "")).strip().lower()
        if "gpl" not in fuel:
            continue

        station_key = build_station_key(row)
        if station_key in seen:
            continue
        seen.add(station_key)

        name = str(row.get("nome", "")).strip()
        brand = normalize_brand(str(row.get("marca", "")).strip())
        district = str(row.get("distrito", "")).strip()
        municipality = str(row.get("municipio", "")).strip()
        locality = str(row.get("localidade", "")).strip()
        address = str(row.get("morada", "")).strip()
        postal_code = str(row.get("codpostal", "")).strip()
        updated_raw = str(row.get("dataatualizacao", "")).strip()
        updated_iso = parse_updated(updated_raw)
        lat = parse_float(row.get("latitude"))
        lon = parse_float(row.get("longitude"))
        price = parse_price(row.get("preco"))

        if not name or lat is None or lon is None:
            continue

        if updated_iso and ("T" in updated_iso):
            if max_updated is None or updated_iso > max_updated:
                max_updated = updated_iso

        stations.append({
            "id": slugify(f"{brand}-{name}-{municipality}-{postal_code or locality}"),
            "name": name,
            "brand": brand,
            "district": district,
            "municipality": municipality,
            "locality": locality,
            "address": address,
            "postalCode": postal_code,
            "zone": zone_for_district(district),
            "fuel": "GPL Auto",
            "price": price,
            "updatedAt": updated_iso or updated_raw,
            "lat": lat,
            "lon": lon,
            "sourceKey": station_key,
        })

    stations.sort(key=lambda item: (
        999 if item["price"] is None else item["price"],
        item["district"],
        item["municipality"],
        item["name"],
    ))

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceSummary": "Dataset gerado automaticamente a partir de data/Postos.csv",
        "dataUpdatedAt": max_updated or "",
        "stats": {
            "totalStations": len(stations),
            "withCoordinates": len([s for s in stations if s.get("lat") is not None and s.get("lon") is not None]),
            "withPrice": len([s for s in stations if s.get("price") is not None]),
        },
        "stations": stations,
    }

    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Gerado: {OUTPUT} ({len(stations)} postos)")


if __name__ == "__main__":
    main()
