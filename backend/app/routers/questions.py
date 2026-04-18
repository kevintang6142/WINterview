from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query

from ..db import get_db

router = APIRouter()


def _serialize(q: dict) -> dict:
    return {
        "id": str(q["_id"]),
        "slug": q.get("slug"),
        "text": q["text"],
        "tags": q.get("tags", []),
        "avg_rating": q.get("avg_rating"),
        "response_count": q.get("response_count", 0),
    }


@router.get("")
async def list_questions(
    q: str | None = Query(None, description="keyword search"),
    limit: int = Query(50, le=200),
):
    db = get_db()
    if q:
        cursor = db.questions.find(
            {"$text": {"$search": q}}, {"score": {"$meta": "textScore"}}
        ).sort([("score", {"$meta": "textScore"})]).limit(limit)
    else:
        cursor = db.questions.find().limit(limit)
    return [_serialize(doc) async for doc in cursor]


@router.get("/random")
async def random_questions(count: int = Query(3, ge=1, le=5)):
    db = get_db()
    pipeline = [{"$sample": {"size": count}}]
    docs = [doc async for doc in db.questions.aggregate(pipeline)]
    return [_serialize(d) for d in docs]


@router.get("/{question_id}")
async def get_question(question_id: str):
    db = get_db()
    try:
        doc = await db.questions.find_one({"_id": ObjectId(question_id)})
    except Exception:
        raise HTTPException(404, "Not found")
    if not doc:
        raise HTTPException(404, "Not found")
    return _serialize(doc)


@router.get("/{question_id}/responses")
async def question_responses(question_id: str, limit: int = Query(20, le=100)):
    """Public responses to this question (used on the question detail page)."""
    db = get_db()
    cursor = (
        db.responses.find({"question_id": question_id, "is_public": True})
        .sort("created_at", -1)
        .limit(limit)
    )
    out = []
    async for r in cursor:
        ev = r.get("evaluation") or {}
        out.append(
            {
                "id": str(r["_id"]),
                "transcript_preview": r["transcript"][:220],
                "words_per_minute": ev.get("words_per_minute"),
                "filler_count": ev.get("filler_count"),
                "avg_rating": r.get("avg_rating"),
                "rating_count": r.get("rating_count", 0),
                "like_count": r.get("like_count", 0),
                "dislike_count": r.get("dislike_count", 0),
                "created_at": r["created_at"],
            }
        )
    return out
