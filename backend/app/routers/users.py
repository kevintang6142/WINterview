from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from ..auth import current_user
from ..db import get_db

router = APIRouter()


@router.get("/me/responses")
async def my_responses(user: dict = Depends(current_user)):
    db = get_db()
    cursor = db.responses.find({"user_id": user["_id"]}).sort("created_at", -1)
    out = []
    async for r in cursor:
        q = await db.questions.find_one({"_id": ObjectId(r["question_id"])})
        out.append(
            {
                "id": str(r["_id"]),
                "question_id": r["question_id"],
                "question_text": q["text"] if q else "",
                "transcript_preview": r["transcript"][:220],
                "overall_score": (r.get("evaluation") or {}).get("overall"),
                "is_public": r.get("is_public", False),
                "avg_rating": r.get("avg_rating"),
                "rating_count": r.get("rating_count", 0),
                "like_count": r.get("like_count", 0),
                "created_at": r["created_at"],
            }
        )
    return out


@router.get("/{user_id}")
async def get_user(user_id: str):
    db = get_db()
    try:
        u = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        raise HTTPException(404, "Not found")
    if not u:
        raise HTTPException(404, "Not found")
    return {
        "id": str(u["_id"]),
        "name": u.get("name"),
        "picture": u.get("picture"),
        "karma": u.get("karma", 0),
    }
