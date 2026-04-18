from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from ..auth import current_user
from ..db import get_db
from ..models import SessionCreate

router = APIRouter()


@router.post("")
async def create_session(body: SessionCreate, user: dict = Depends(current_user)):
    db = get_db()

    if body.mode == "selected":
        if not body.question_ids:
            raise HTTPException(400, "Provide question_ids for selected mode")
        ids = [ObjectId(qid) for qid in body.question_ids]
        docs = [doc async for doc in db.questions.find({"_id": {"$in": ids}})]
    else:
        pipeline = [{"$sample": {"size": body.count}}]
        docs = [doc async for doc in db.questions.aggregate(pipeline)]

    if not docs:
        raise HTTPException(400, "No questions available")

    question_ids = [str(d["_id"]) for d in docs]
    doc = {
        "user_id": user["_id"],
        "mode": body.mode,
        "question_ids": question_ids,
        "created_at": datetime.now(timezone.utc),
        "completed_at": None,
    }
    res = await db.sessions.insert_one(doc)
    return {
        "id": str(res.inserted_id),
        "mode": body.mode,
        "questions": [
            {"id": str(d["_id"]), "text": d["text"], "tags": d.get("tags", [])}
            for d in docs
        ],
    }


@router.post("/{session_id}/complete")
async def complete_session(session_id: str, user: dict = Depends(current_user)):
    db = get_db()
    res = await db.sessions.update_one(
        {"_id": ObjectId(session_id), "user_id": user["_id"]},
        {"$set": {"completed_at": datetime.now(timezone.utc)}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Session not found")
    return {"ok": True}
