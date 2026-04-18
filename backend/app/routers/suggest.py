from fastapi import APIRouter, Query

from ..services import brave_svc

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
