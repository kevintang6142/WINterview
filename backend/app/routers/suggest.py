from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import current_user
from ..db import get_db
from ..services import brave_svc
from ..services.gemini_svc import pick_categories_for_company

router = APIRouter()


@router.get("/company")
async def company_suggest(q: str = Query(..., min_length=1, max_length=80)):
    """Proxy to Brave's Suggest API. Returns [] if Brave is unavailable so
    the UI still works — users can always type a company name freely."""
    try:
        suggestions = await brave_svc.suggest(q, count=8)
    except Exception:
        return []
    # Light filtering: prefer entity-looking names, drop pure queries that
    # are just the raw input.
    qnorm = q.strip().lower()
    return [s for s in suggestions if s and s.strip().lower() != qnorm]


@router.get("/company-categories")
async def company_categories(
    q: str = Query(..., min_length=1, max_length=80),
    _user: dict = Depends(current_user),
):
    """Given a company name, Brave-search its interview writeups and ask
    Gemini which of our behavioral-question categories to focus on. Used
    by the "Filter by company" button in the practice setup page."""
    company = q.strip()
    if not company:
        raise HTTPException(400, "Empty company")

    db = get_db()
    raw = await db.questions.distinct("category")
    all_categories = sorted([c for c in raw if c])
    if not all_categories:
        return {"categories": [], "reason": None}

    query = (
        f"{company} behavioral interview questions "
        "site:reddit.com OR site:glassdoor.com OR site:leetcode.com"
    )
    snippets: list[dict] = []
    try:
        snippets = await brave_svc.web_search(query, count=10)
    except Exception as e:
        print(f"[suggest] Brave failed for {company!r}: {e}")

    try:
        return await pick_categories_for_company(company, snippets, all_categories)
    except Exception as e:
        print(f"[suggest] Gemini pick failed for {company!r}: {e}")
        return {"categories": [], "reason": None}
