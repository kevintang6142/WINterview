import asyncio
import re
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from ..auth import current_user
from ..db import get_db
from ..models import SessionCreate
from ..services import brave_svc
from ..services.gemini_svc import generate_questions

router = APIRouter()


def _slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:80]


async def _generate_and_persist(
    db, count: int, company: str | None
) -> list[dict]:
    """Hit Brave for real-world interview context, feed to Gemini,
    persist each question (deduping by slug), and return the docs."""
    # Run two parallel Brave queries:
    #   1. Broad: "<Company> behavioral interview questions"
    #   2. Biased toward concrete reports: adds Glassdoor/LeetCode/Blind as hints
    # Combining gives Gemini a better chance of seeing specific reported Qs.
    if company:
        q1 = f"{company} behavioral interview questions"
        q2 = f'"{company}" interview questions glassdoor OR leetcode OR blind "tell me about"'
    else:
        q1 = "common behavioral interview questions"
        q2 = 'behavioral interview questions "tell me about a time" examples'

    async def safe_search(q):
        try:
            return await brave_svc.web_search(q, count=10)
        except Exception as e:
            print(f"[generate] Brave search failed for {q!r}: {e}")
            return []

    results = await asyncio.gather(safe_search(q1), safe_search(q2))
    # Dedupe snippets by URL while preserving order.
    seen = set()
    snippets: list[dict] = []
    for group in results:
        for s in group:
            url = s.get("url")
            if url and url in seen:
                continue
            if url:
                seen.add(url)
            snippets.append(s)

    try:
        generated = await generate_questions(count, company, snippets)
    except Exception as e:
        raise HTTPException(502, f"Question generation failed: {e}")

    if not generated:
        raise HTTPException(502, "No questions generated")

    now = datetime.now(timezone.utc)
    docs: list[dict] = []
    for q in generated:
        slug = _slugify(q["text"])
        tags = q.get("tags", [])
        if company:
            tags = list({*tags, company.lower()})
        set_on_insert = {
            "slug": slug,
            "text": q["text"],
            "source": "generated",
            "company": company,
            "generated_at": now,
            "response_count": 0,
            "avg_rating": None,
        }
        # tags managed via $addToSet so re-generation merges, not overwrites.
        await db.questions.update_one(
            {"slug": slug},
            {
                "$setOnInsert": set_on_insert,
                "$addToSet": {"tags": {"$each": tags}},
            },
            upsert=True,
        )
        final = await db.questions.find_one({"slug": slug})
        if final:
            docs.append(final)
    return docs


@router.post("")
async def create_session(body: SessionCreate, user: dict = Depends(current_user)):
    db = get_db()

    if body.mode == "selected":
        if not body.question_ids:
            raise HTTPException(400, "Provide question_ids for selected mode")
        ids = [ObjectId(qid) for qid in body.question_ids]
        docs = [doc async for doc in db.questions.find({"_id": {"$in": ids}})]

    elif body.mode == "generated":
        docs = await _generate_and_persist(db, body.count, body.company)

    else:  # random (from preset pool)
        pipeline = [
            {"$match": {"source": {"$ne": "generated"}}},
            {"$sample": {"size": body.count}},
        ]
        docs = [doc async for doc in db.questions.aggregate(pipeline)]
        if not docs:
            # Fall back to sampling the whole collection if there's no preset source tag
            pipeline = [{"$sample": {"size": body.count}}]
            docs = [doc async for doc in db.questions.aggregate(pipeline)]

    if not docs:
        raise HTTPException(400, "No questions available")

    question_ids = [str(d["_id"]) for d in docs]
    doc = {
        "user_id": user["_id"],
        "mode": body.mode,
        "company": body.company,
        "question_ids": question_ids,
        "created_at": datetime.now(timezone.utc),
        "completed_at": None,
    }
    res = await db.sessions.insert_one(doc)
    return {
        "id": str(res.inserted_id),
        "mode": body.mode,
        "company": body.company,
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
