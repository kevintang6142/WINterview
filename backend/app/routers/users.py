from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from ..auth import current_user
from ..db import get_db
from ..models import MasterySet

router = APIRouter()


@router.get("/me/mastery")
async def get_mastery(user: dict = Depends(current_user)):
    db = get_db()
    u = await db.users.find_one({"_id": ObjectId(user["_id"])}, {"mastery": 1})
    return {"mastery": (u or {}).get("mastery", {})}


@router.post("/me/mastery")
async def set_mastery(body: MasterySet, user: dict = Depends(current_user)):
    db = get_db()
    if body.state == "none":
        await db.users.update_one(
            {"_id": ObjectId(user["_id"])},
            {"$unset": {f"mastery.{body.question_id}": ""}},
        )
    else:
        await db.users.update_one(
            {"_id": ObjectId(user["_id"])},
            {"$set": {f"mastery.{body.question_id}": body.state}},
        )
    return {"ok": True}


@router.get("/me/responses")
async def my_responses(user: dict = Depends(current_user)):
    db = get_db()
    cursor = db.responses.find({"user_id": user["_id"]}).sort("created_at", -1)
    out = []
    async for r in cursor:
        q = await db.questions.find_one({"_id": ObjectId(r["question_id"])})
        comment_count = await db.comments.count_documents({"response_id": str(r["_id"])}) if r.get("is_public") else 0
        out.append(
            {
                "id": str(r["_id"]),
                "question_id": r["question_id"],
                "question_text": q["text"] if q else "",
                "question_category": q.get("category", "") if q else "",
                "transcript_preview": r["transcript"][:220],
                "overall_score": (r.get("evaluation") or {}).get("overall"),
                "is_public": r.get("is_public", False),
                "avg_rating": r.get("avg_rating"),
                "rating_count": r.get("rating_count", 0),
                "comment_count": comment_count,
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
