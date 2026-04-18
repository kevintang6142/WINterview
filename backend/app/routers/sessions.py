from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from ..auth import current_user
from ..db import get_db
from ..models import SessionCreate
from ..services import brave_svc
from ..services.gemini_svc import pick_categories_for_company

router = APIRouter()


async def _categories_for_company(db, company: str) -> dict:
    """Brave-search the company's interview process, ask Gemini which of our
    existing question categories to focus on. Returns
    {categories: [...], reason: str | None} — never raises; returns an empty
    category list if the whole pipeline fails."""
    raw = await db.questions.distinct("category")
    all_categories = sorted([c for c in raw if c])
    if not all_categories:
        return {"categories": [], "reason": None}

    query = f"{company} behavioral interview questions site:reddit.com OR site:glassdoor.com OR site:leetcode.com"
    snippets: list[dict] = []
    try:
        snippets = await brave_svc.web_search(query, count=10)
    except Exception as e:
        print(f"[sessions] Brave search failed for {company!r}: {e}")

    try:
        result = await pick_categories_for_company(company, snippets, all_categories)
    except Exception as e:
        print(f"[sessions] Gemini category pick failed: {e}")
        return {"categories": [], "reason": None}
    return result


@router.post("")
async def create_session(body: SessionCreate, user: dict = Depends(current_user)):
    db = get_db()
    meta: dict = {}

    if body.mode == "selected":
        if not body.question_ids:
            raise HTTPException(400, "Provide question_ids for selected mode")
        ids = [ObjectId(qid) for qid in body.question_ids]
        docs = [doc async for doc in db.questions.find({"_id": {"$in": ids}})]

    else:  # random
        categories: list[str] = list(body.categories or [])

        # Company overrides any manual category list — Brave+Gemini pick them.
        if body.company:
            picked = await _categories_for_company(db, body.company.strip())
            if picked["categories"]:
                categories = picked["categories"]
                meta["company"] = body.company.strip()
                meta["picked_categories"] = picked["categories"]
                if picked.get("reason"):
                    meta["reason"] = picked["reason"]

        match: dict = {}
        if categories:
            match["category"] = {"$in": categories}
        pipeline: list[dict] = []
        if match:
            pipeline.append({"$match": match})
        pipeline.append({"$sample": {"size": body.count}})
        docs = [doc async for doc in db.questions.aggregate(pipeline)]
        if not docs:
            # Fall back to full collection if category filter yields nothing
            pipeline = [{"$sample": {"size": body.count}}]
            docs = [doc async for doc in db.questions.aggregate(pipeline)]

    if not docs:
        raise HTTPException(400, "No questions available")

    question_ids = [str(d["_id"]) for d in docs]
    doc = {
        "user_id": user["_id"],
        "mode": body.mode,
        "company": meta.get("company"),
        "question_ids": question_ids,
        "created_at": datetime.now(timezone.utc),
        "completed_at": None,
    }
    res = await db.sessions.insert_one(doc)
    return {
        "id": str(res.inserted_id),
        "mode": body.mode,
        **meta,
        "questions": [
            {"id": str(d["_id"]), "text": d["text"], "tags": d.get("tags", []), "category": d.get("category", "")}
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
