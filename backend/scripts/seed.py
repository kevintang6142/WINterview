"""Seed the questions collection from app/data/questions.json.

Usage:
    cd backend
    uv run python scripts/seed.py
"""

import asyncio
import json
import re
import sys
from pathlib import Path

# Make `app` importable when running `uv run python scripts/seed.py` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import ensure_indexes, get_db  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "app" / "data" / "questions.json"


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:80]


async def main():
    await ensure_indexes()
    db = get_db()
    items = json.loads(DATA.read_text())
    inserted = 0
    for item in items:
        slug = slugify(item["text"])
        doc = {
            "slug": slug,
            "text": item["text"],
            "tags": item.get("tags", []),
            "response_count": 0,
            "avg_rating": None,
        }
        res = await db.questions.update_one(
            {"slug": slug}, {"$setOnInsert": doc}, upsert=True
        )
        if res.upserted_id:
            inserted += 1
    total = await db.questions.count_documents({})
    print(f"Inserted {inserted} new questions. Total: {total}")


if __name__ == "__main__":
    asyncio.run(main())
