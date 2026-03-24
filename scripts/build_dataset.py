from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="CSV consolidado")
    parser.add_argument("--output", required=True, help="JSON final")
    return parser.parse_args()


def load_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            rows.append(
                {
                    "name": row.get("name", "").strip(),
                    "brand": row.get("brand", "").strip(),
                    "address": row.get("address", "").strip(),
                    "city": row.get("city", "").strip(),
                    "district": row.get("district", "").strip(),
                    "lat": float(row["lat"]),
                    "lon": float(row["lon"]),
                    "price": float(row["price"]) if row.get("price") else None,
                    "priceSource": row.get("price_source", "").strip() or None,
                    "lastUpdated": row.get("last_updated", "").strip() or None,
                }
            )
    return rows


def build_json(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "meta": {
            "country": "Portugal",
            "fuel": "GPL Auto",
            "generatedAt": "manual",
            "count": len(rows),
        },
        "stations": rows,
    }


def main() -> None:
    args = parse_args()
    rows = load_rows(Path(args.input))
    output = build_json(rows)
    Path(args.output).write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Gerado: {args.output} ({len(rows)} postos)")


if __name__ == "__main__":
    main()
