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
    attempts = [
        {"sep": ";", "encoding": "utf-8"},
        {"sep": ",", "encoding": "utf-8"},
        {"sep": ";", "encoding": "latin1"},
        {"sep": ",", "encoding": "latin1"},
    ]

    errors = []

    for attempt in attempts:
        try:
            df = pd.read_csv(
                path,
                sep=attempt["sep"],
                encoding=attempt["encoding"],
                engine="python",
                on_bad_lines="skip",
            )

            print(
                f"CSV lido com sucesso usando sep='{attempt['sep']}' "
                f"e encoding='{attempt['encoding']}'"
            )
            print(f"Linhas após limpeza: {len(df)}")

            if df.empty:
                raise RuntimeError("CSV lido mas sem linhas.")

            if len(df.columns) <= 1:
                raise RuntimeError(
                    f"CSV lido mas parece mal delimitado. Número de colunas: {len(df.columns)}"
                )

            print(df.head())
            return df

        except Exception as exc:  # noqa: BLE001
            errors.append(
                f"Falhou sep='{attempt['sep']}', encoding='{attempt['encoding']}': {exc}"
            )

    error_text = "\n".join(errors)
    raise RuntimeError(f"Não foi possível ler o CSV.\n{error_text}")


def parse_price(value):
    if value is None:
        return None
    text = str(value).strip().replace("€", "").replace(" ", "").replace(",", ".")
    if text.lower() in {"", "nan", "na", "none", "null"}:
        return None
    try:
        return round(float(text), 3)
    except ValueError:
        return None


def parse_float(value):
    if value is None:
        return None
    text = str(value).strip().replace(",", ".")
    if text.lower() in {"", "nan", "na", "none", "null"}:
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

    norte = {"viana do castelo", "braga", "porto", "vila real", "braganca"}
    centro = {"aveiro", "viseu", "guarda", "coimbra", "castelo branco", "leiria"}
    lisboa = {"lisboa", "santarem", "setubal"}
    alentejo = {"portalegre", "evora", "beja"}
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


def resolve_column(df: pd.DataFrame, candidates: list[str], label: str) -> str:
    for candidate in candidates:
        if candidate in df.columns:
            return candidate
    raise RuntimeError(
        f"Não foi encontrada nenhuma coluna para '{label}'. Candidatas: {candidates}"
    )


def main():
    if not CSV_FILE.exists():
        raise FileNotFoundError(f"CSV não encontrado: {CSV_FILE}")

    if CSV_FILE.stat().st_size < 100:
        raise RuntimeError(f"CSV demasiado pequeno ou inválido: {CSV_FILE}")

    df = read_csv_fallback(CSV_FILE)
    df.columns = [clean_col(c) for c in df.columns]

    print(f"Colunas detetadas: {list(df.columns)}")
    print(f"Total de linhas no CSV: {len(df)}")

    col_nome = resolve_column(df, ["nome"], "nome")
    col_preco = resolve_column(df, ["preco"], "preço")
    col_marca = resolve_column(df, ["marca"], "marca")
    col_combustivel = resolve_column(df, ["combustivel"], "combustível")
    col_distrito = resolve_column(df, ["distrito"], "distrito")
    col_municipio = resolve_column(df, ["municipio", "concelho"], "município")
    col_latitude = resolve_column(df, ["latitude", "lat"], "latitude")
    col_longitude = resolve_column(df, ["longitude", "lon", "lng"], "longitude")

    col_localidade = next((c for c in ["localidade", "freguesia"] if c in df.columns), "")
    col_morada = next((c for c in ["morada", "endereco", "endereco1"] if c in df.columns), "")
    col_postal = next((c for c in ["codpostal", "codigopostal", "cp"] if c in df.columns), "")
    col_data = next((c for c in ["dataatualizacao", "data", "updatedat"] if c in df.columns), "")

    stations = []
    seen = set()
    max_updated = None

    for _, row in df.iterrows():
        fuel = str(row.get(col_combustivel, "")).strip().lower()
        if "gpl" not in fuel:
            continue

        normalized_row = {
            "nome": row.get(col_nome, ""),
            "preco": row.get(col_preco, ""),
            "marca": row.get(col_marca, ""),
            "combustivel": row.get(col_combustivel, ""),
            "distrito": row.get(col_distrito, ""),
            "municipio": row.get(col_municipio, ""),
            "localidade": row.get(col_localidade, "") if col_localidade else "",
            "morada": row.get(col_morada, "") if col_morada else "",
            "codpostal": row.get(col_postal, "") if col_postal else "",
            "dataatualizacao": row.get(col_data, "") if col_data else "",
            "latitude": row.get(col_latitude, ""),
            "longitude": row.get(col_longitude, ""),
        }

        station_key = build_station_key(normalized_row)
        if station_key in seen:
            continue
        seen.add(station_key)

        name = str(normalized_row["nome"]).strip()
        brand = normalize_brand(str(normalized_row["marca"]).strip())
        district = str(normalized_row["distrito"]).strip()
        municipality = str(normalized_row["municipio"]).strip()
        locality = str(normalized_row["localidade"]).strip()
        address = str(normalized_row["morada"]).strip()
        postal_code = str(normalized_row["codpostal"]).strip()
        updated_raw = str(normalized_row["dataatualizacao"]).strip()
        updated_iso = parse_updated(updated_raw)
        lat = parse_float(normalized_row["latitude"])
        lon = parse_float(normalized_row["longitude"])
        price = parse_price(normalized_row["preco"])

        if not name or lat is None or lon is None:
            continue

        if updated_iso and "T" in updated_iso:
            if max_updated is None or updated_iso > max_updated:
                max_updated = updated_iso

        stations.append(
            {
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
            }
        )

    if len(stations) < 50:
        raise RuntimeError(
            f"Foram gerados poucos postos ({len(stations)}). "
            "Isto pode indicar erro no parse do CSV."
        )

    stations.sort(
        key=lambda item: (
            999 if item["price"] is None else item["price"],
            item["district"],
            item["municipality"],
            item["name"],
        )
    )

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceSummary": "Dataset gerado automaticamente a partir de data/Postos.csv",
        "dataUpdatedAt": max_updated or "",
        "stats": {
            "totalStations": len(stations),
            "withCoordinates": len(
                [s for s in stations if s.get("lat") is not None and s.get("lon") is not None]
            ),
            "withPrice": len([s for s in stations if s.get("price") is not None]),
        },
        "stations": stations,
    }

    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Gerado: {OUTPUT} ({len(stations)} postos)")


if __name__ == "__main__":
    main()
