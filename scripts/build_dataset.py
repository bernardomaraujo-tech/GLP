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
    col = str(col).strip().replace("ï»¿", "").replace("\ufeff", "")
    col = unicodedata.normalize("NFKD", col).encode("ascii", "ignore").decode("ascii")
    col = col.lower()
    col = re.sub(r"\s+", "", col)
    return col


def safe_float(value):
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
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
    return value or "posto"


def read_csv_fallback(path: Path) -> pd.DataFrame:
    encodings = ["utf-8-sig", "utf-8", "latin1", "cp1252"]
    last_error = None

    for enc in encodings:
        try:
            return pd.read_csv(path, sep=";", encoding=enc)
        except Exception as exc:
            last_error = exc

    raise RuntimeError(f"Não foi possível ler o CSV: {last_error}")


def normalize_brand(value: str) -> str:
    text = (value or "").strip().upper()
    mapping = {
        "GALPENERGIA": "GALP",
        "GALP ENERGIA": "GALP",
        "PRIO ENERGY": "PRIO",
        "AUCHAN RETAIL": "AUCHAN",
    }
    return mapping.get(text, text)


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if not CSV_FILE.exists():
        raise FileNotFoundError(f"CSV não encontrado: {CSV_FILE}")

    df = read_csv_fallback(CSV_FILE)
    df.columns = [clean_col(c) for c in df.columns]

    col_name = "nome"
    col_brand = "marca"
    col_district = "distrito"
    col_municipality = "municipio"
    col_locality = "localidade" if "localidade" in df.columns else None
    col_address = "morada" if "morada" in df.columns else None
    col_postal = "codpostal" if "codpostal" in df.columns else None
    col_price = "preco"
    col_fuel = "combustivel"
    col_updated = "atualizado" if "atualizado" in df.columns else "dataatualizacao" if "dataatualizacao" in df.columns else None
    col_lat = "latitude"
    col_lon = "longitude"

    required = [col_name, col_brand, col_district, col_municipality, col_price, col_fuel, col_lat, col_lon]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise RuntimeError(f"Faltam colunas esperadas no CSV: {missing}")

    stations = []
    seen = set()

    for _, row in df.iterrows():
        fuel = str(row.get(col_fuel, "")).strip().lower()
        if "gpl" not in fuel:
            continue

        name = str(row.get(col_name, "")).strip()
        brand = normalize_brand(str(row.get(col_brand, "")).strip())
        district = str(row.get(col_district, "")).strip()
        municipality = str(row.get(col_municipality, "")).strip()
        locality = str(row.get(col_locality, "")).strip() if col_locality else ""
        address = str(row.get(col_address, "")).strip() if col_address else ""
        postal = str(row.get(col_postal, "")).strip() if col_postal else ""
        updated = str(row.get(col_updated, "")).strip() if col_updated else ""
        lat = safe_float(row.get(col_lat))
        lon = safe_float(row.get(col_lon))
        price = safe_float(row.get(col_price))

        if not name or lat is None or lon is None:
            continue

        key = (brand.lower(), name.lower(), municipality.lower())
        if key in seen:
            continue
        seen.add(key)

        stations.append({
            "id": slugify(f"{brand}-{name}-{municipality}"),
            "name": name,
            "brand": brand,
            "district": district,
            "municipality": municipality,
            "locality": locality,
            "address": address,
            "postalCode": postal,
            "lat": lat,
            "lon": lon,
            "price": price,
            "updated": updated,
            "source": "dgeg-csv",
            "sourcePrice": "dgeg-csv",
            "sourceLocation": "dgeg-csv",
        })

    stations.sort(key=lambda s: (s["district"], s["municipality"], s["brand"], s["name"]))

    payload = {
        "generatedAt": datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M"),
        "sourceSummary": "Fonte: CSV DGEG exportado automaticamente",
        "stats": {
            "totalStations": len(stations),
            "withCoordinates": sum(1 for s in stations if s["lat"] is not None and s["lon"] is not None),
            "withPrice": sum(1 for s in stations if s["price"] is not None),
        },
        "stations": stations,
    }

    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Gerado {OUTPUT} com {len(stations)} postos.")


if __name__ == "__main__":
    main()
