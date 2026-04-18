"""Seed the questions collection from app/data/questions.json.

Drops the existing questions collection and re-seeds from scratch so the
PDF-sourced questions replace any old data.

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
    db = get_db()
    # Drop and re-seed so PDF questions fully replace old data
    await db.questions.drop()
    print("Dropped existing questions collection.")

    items = json.loads(DATA.read_text())
    docs = []
    seen_slugs: set[str] = set()
    for item in items:
        slug = slugify(item["text"])
        if slug in seen_slugs:
            continue
        seen_slugs.add(slug)
        docs.append({
            "slug": slug,
            "text": item["text"],
            "category": item.get("category", ""),
            "tags": item.get("tags", []),
            "response_count": 0,
            "avg_rating": None,
        })

    if docs:
        await db.questions.insert_many(docs)

    await ensure_indexes()
    total = await db.questions.count_documents({})
    print(f"Inserted {len(docs)} questions. Total: {total}")


if __name__ == "__main__":
    asyncio.run(main())
