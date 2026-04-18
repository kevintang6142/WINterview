from __future__ import annotations

import httpx

from ..config import settings

BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
BRAVE_SUGGEST_URL = "https://api.search.brave.com/res/v1/suggest/search"


def _headers() -> dict:
    if not settings.BRAVE_API_KEY:
        raise RuntimeError("BRAVE_API_KEY not configured")
    return {
        "Accept": "application/json",
        "X-Subscription-Token": settings.BRAVE_API_KEY,
    }


async def web_search(query: str, count: int = 10) -> list[dict]:
    """Returns a simplified list of {title, description, url}."""
    params = {"q": query, "count": count, "safesearch": "moderate"}
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(BRAVE_SEARCH_URL, headers=_headers(), params=params)
        r.raise_for_status()
        data = r.json()

    results = []
    for item in (data.get("web") or {}).get("results", []):
        results.append(
            {
                "title": item.get("title", ""),
                "description": item.get("description", ""),
                "url": item.get("url", ""),
            }
        )
    return results


async def suggest(query: str, count: int = 8) -> list[str]:
    """Company/entity autocomplete suggestions (list of strings)."""
    params = {"q": query, "count": count}
    async with httpx.AsyncClient(timeout=8) as client:
        r = await client.get(BRAVE_SUGGEST_URL, headers=_headers(), params=params)
        r.raise_for_status()
        data = r.json()

    out: list[str] = []
    for item in data.get("results", []):
        q = item.get("query")
        if q:
            out.append(q)
    return out
