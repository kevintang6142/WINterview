from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query

from ..db import get_db

router = APIRouter()


def _serialize(q: dict) -> dict:
    return {
        "id": str(q["_id"]),
        "slug": q.get("slug"),
        "text": q["text"],
        "category": q.get("category", ""),
        "tags": q.get("tags", []),
        "avg_rating": q.get("avg_rating"),
        "response_count": q.get("response_count", 0),
        "public_response_count": q.get("public_response_count", 0),
    }


@router.get("")
async def list_questions(
    q: str | None = Query(None, description="substring search"),
    categories: list[str] = Query(default=[], description="category filter (multi)"),
    limit: int = Query(300, le=500),
):
    db = get_db()
    filt: dict = {}
    if categories:
        filt["category"] = {"$in": categories}
    if q:
        filt["text"] = {"$regex": q, "$options": "i"}
    pipeline = [
        {"$match": filt},
        {"$limit": limit},
        {
            "$lookup": {
                "from": "responses",
                "let": {"qid": {"$toString": "$_id"}},
                "pipeline": [
                    {"$match": {"$expr": {"$and": [
                        {"$eq": ["$question_id", "$$qid"]},
                        {"$eq": ["$is_public", True]},
                    ]}}},
                    {"$count": "n"},
                ],
                "as": "_pub",
            }
        },
        {
            "$addFields": {
                "public_response_count": {"$ifNull": [{"$arrayElemAt": ["$_pub.n", 0]}, 0]}
            }
        },
    ]
    docs = [doc async for doc in db.questions.aggregate(pipeline)]
    return [_serialize(doc) for doc in docs]


@router.get("/random")
async def random_questions(
    count: int = Query(3, ge=1, le=5),
    categories: list[str] = Query(default=[], description="category filter (multi)"),
):
    db = get_db()
    match: dict = {}
    if categories:
        match["category"] = {"$in": categories}
    pipeline: list[dict] = []
    if match:
        pipeline.append({"$match": match})
    pipeline.append({"$sample": {"size": count}})
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
                "created_at": r["created_at"],
            }
        )
    return out
