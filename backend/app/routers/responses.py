from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..auth import current_user, optional_user
from ..db import get_db
from ..models import CommentCreate, RatingCreate, ReactionCreate, ResponseSubmit
from ..services.gemini_svc import analyze_pacing, evaluate_response, merge_evaluation

router = APIRouter()


class PublicToggle(BaseModel):
    is_public: bool


# ---------- Submit & evaluate ----------
@router.post("")
async def submit_response(body: ResponseSubmit, user: dict = Depends(current_user)):
    db = get_db()
    question = await db.questions.find_one({"_id": ObjectId(body.question_id)})
    if not question:
        raise HTTPException(404, "Question not found")

    pacing = analyze_pacing(body.transcript, body.duration_seconds, body.word_timestamps)
    gemini = await evaluate_response(question["text"], body.transcript, pacing)
    evaluation = merge_evaluation(gemini, pacing)

    doc = {
        "user_id": user["_id"],
        "session_id": body.session_id,
        "question_id": body.question_id,
        "transcript": body.transcript,
        "duration_seconds": body.duration_seconds,
        "evaluation": evaluation,
        "is_public": False,
        "avg_rating": None,
        "rating_count": 0,
        "created_at": datetime.now(timezone.utc),
    }
    res = await db.responses.insert_one(doc)
    await db.questions.update_one(
        {"_id": question["_id"]}, {"$inc": {"response_count": 1}}
    )
    return {"id": str(res.inserted_id), "evaluation": evaluation}


# ---------- Read ----------
@router.get("/feed")
async def feed(
    limit: int = Query(30, le=100),
    sort: str = Query("hot", pattern="^(new|top|hot)$"),
    time_range: str = Query("all", pattern="^(now|today|week|month|year|all)$"),
    user: dict | None = Depends(optional_user),
):
    db = get_db()
    from datetime import timedelta
    import math

    base_filter: dict = {"is_public": True}

    # Time range filter — only used for "top"
    if sort == "top" and time_range != "all":
        now = datetime.now(timezone.utc)
        delta_map = {
            "now":   timedelta(hours=1),
            "today": timedelta(days=1),
            "week":  timedelta(weeks=1),
            "month": timedelta(days=30),
            "year":  timedelta(days=365),
        }
        base_filter["created_at"] = {"$gte": now - delta_map[time_range]}

    if sort == "new":
        cursor_iter = db.responses.find(base_filter).sort([("created_at", -1)]).limit(limit)
        docs = [r async for r in cursor_iter]
    elif sort == "top":
        # top = avg_rating * rating_count, stable sort by recency
        pipeline = [
            {"$match": base_filter},
            {"$addFields": {
                "_score": {
                    "$multiply": [
                        {"$ifNull": ["$avg_rating", 0]},
                        {"$ifNull": ["$rating_count", 0]},
                    ]
                }
            }},
            {"$sort": {"_score": -1, "created_at": -1}},
            {"$limit": limit},
        ]
        docs = [r async for r in db.responses.aggregate(pipeline)]
    else:  # hot = score decayed by age (similar to Reddit's gravity formula)
        # Fetch more than needed so we can sort in Python with full precision
        candidates = [r async for r in db.responses.find(base_filter).limit(max(limit * 10, 200))]
        now_ts = datetime.now(timezone.utc).timestamp()
        GRAVITY = 1.8
        def hot_score(r: dict) -> float:
            score = (r.get("avg_rating") or 0) * (r.get("rating_count") or 0)
            age_hours = max((now_ts - r["created_at"].timestamp()) / 3600, 0.1)
            return score / (age_hours + 2) ** GRAVITY
        docs = sorted(candidates, key=hot_score, reverse=True)[:limit]

    out = []
    for r in docs:
        q = await db.questions.find_one({"_id": ObjectId(r["question_id"])})
        ev = r.get("evaluation") or {}
        comment_count = await db.comments.count_documents({"response_id": str(r["_id"])})
        out.append(
            {
                "id": str(r["_id"]),
                "question_id": r["question_id"],
                "question_text": q["text"] if q else "",
                "question_category": q.get("category", "") if q else "",
                "transcript_preview": r["transcript"][:240],
                "words_per_minute": ev.get("words_per_minute"),
                "filler_count": ev.get("filler_count"),
                "avg_rating": r.get("avg_rating"),
                "rating_count": r.get("rating_count", 0),
                "comment_count": comment_count,
                "is_owner": user is not None and user["_id"] == r["user_id"],
                "is_public": r.get("is_public", True),
                "created_at": r["created_at"],
            }
        )
    return out


@router.get("/{response_id}")
async def get_response(
    response_id: str, user: dict | None = Depends(optional_user)
):
    db = get_db()
    r = await db.responses.find_one({"_id": ObjectId(response_id)})
    if not r:
        raise HTTPException(404, "Not found")

    is_owner = user is not None and user["_id"] == r["user_id"]
    if not r.get("is_public") and not is_owner:
        raise HTTPException(403, "Private response")

    q = await db.questions.find_one({"_id": ObjectId(r["question_id"])})

    # Owner sees the full AI breakdown. Public viewers see only objective
    # data: transcript, pacing, filler words — no AI scores or feedback.
    evaluation = r.get("evaluation")
    if not is_owner and evaluation:
        evaluation = {
            "words_per_minute": evaluation.get("words_per_minute"),
            "filler_count": evaluation.get("filler_count"),
            "filler_words": evaluation.get("filler_words", {}),
            "word_count": evaluation.get("word_count"),
            "duration_seconds": evaluation.get("duration_seconds"),
            "pacing_timeline": evaluation.get("pacing_timeline", []),
        }

    my_rating = None
    if user is not None:
        rating = await db.ratings.find_one(
            {"response_id": response_id, "user_id": user["_id"]}
        )
        if rating:
            my_rating = {
                "structure_star": rating.get("structure_star"),
                "specificity_depth": rating.get("specificity_depth"),
                "delivery_pacing": rating.get("delivery_pacing"),
                "relevance": rating.get("relevance"),
                "reflection": rating.get("reflection"),
            }

    return {
        "id": str(r["_id"]),
        "question_id": r["question_id"],
        "question_text": q["text"] if q else "",
        "question_category": q.get("category", "") if q else "",
        "transcript": r["transcript"],
        "duration_seconds": r.get("duration_seconds", 0),
        "evaluation": evaluation,
        "is_public": r.get("is_public", False),
        "is_owner": is_owner,
        "avg_rating": r.get("avg_rating"),
        "rating_count": r.get("rating_count", 0),
        "my_rating": my_rating,
        "created_at": r["created_at"],
    }


@router.post("/{response_id}/public")
async def toggle_public(
    response_id: str, body: PublicToggle, user: dict = Depends(current_user)
):
    db = get_db()
    r = await db.responses.find_one({"_id": ObjectId(response_id)})
    if not r:
        raise HTTPException(404, "Not found")
    if r["user_id"] != user["_id"]:
        raise HTTPException(403, "Not your response")
    was_public = r.get("is_public", False)
    await db.responses.update_one(
        {"_id": ObjectId(response_id)}, {"$set": {"is_public": body.is_public}}
    )
    if was_public != body.is_public and r.get("question_id"):
        inc = 1 if body.is_public else -1
        await db.questions.update_one(
            {"_id": ObjectId(r["question_id"])},
            {"$inc": {"public_response_count": inc}},
        )
    return {"ok": True, "is_public": body.is_public}


@router.delete("/{response_id}")
async def delete_response(
    response_id: str, user: dict = Depends(current_user)
):
    db = get_db()
    r = await db.responses.find_one({"_id": ObjectId(response_id)})
    if not r:
        raise HTTPException(404, "Not found")
    if r["user_id"] != user["_id"]:
        raise HTTPException(403, "Not your response")
    await db.responses.delete_one({"_id": ObjectId(response_id)})
    # Cascade: remove associated ratings, reactions, and comments
    await db.ratings.delete_many({"response_id": response_id})
    await db.reactions.delete_many({"target_type": "response", "target_id": response_id})
    comment_ids = [
        str(c["_id"])
        async for c in db.comments.find({"response_id": response_id}, {"_id": 1})
    ]
    if comment_ids:
        await db.reactions.delete_many({"target_type": "comment", "target_id": {"$in": comment_ids}})
    await db.comments.delete_many({"response_id": response_id})
    # Decrement question response_count (and public_response_count if was public)
    if r.get("question_id"):
        inc = {"response_count": -1}
        if r.get("is_public"):
            inc["public_response_count"] = -1
        await db.questions.update_one(
            {"_id": ObjectId(r["question_id"])}, {"$inc": inc}
        )
    return {"ok": True}


# ---------- Comments ----------
@router.get("/{response_id}/comments")
async def list_comments(
    response_id: str, user: dict | None = Depends(optional_user)
):
    db = get_db()
    cursor = db.comments.find({"response_id": response_id}).sort("created_at", 1)
    comments = [c async for c in cursor]
    my_by_target: dict[str, int] = {}
    if user and comments:
        ids = [str(c["_id"]) for c in comments]
        async for r in db.reactions.find(
            {
                "target_type": "comment",
                "target_id": {"$in": ids},
                "user_id": user["_id"],
            }
        ):
            my_by_target[r["target_id"]] = r["value"]
    # Batch fetch commenter karma
    unique_user_ids = list({c["user_id"] for c in comments})
    karma_by_user: dict[str, int] = {}
    if unique_user_ids:
        async for u in db.users.find(
            {"_id": {"$in": [ObjectId(uid) for uid in unique_user_ids]}},
            {"_id": 1, "karma": 1},
        ):
            karma_by_user[str(u["_id"])] = u.get("karma", 0)
    return [
        {
            "id": str(c["_id"]),
            "user_id": c["user_id"],
            "user_name": c.get("user_name", "Anonymous"),
            "user_picture": c.get("user_picture"),
            "user_karma": karma_by_user.get(c["user_id"], 0),
            "body": c["body"],
            "like_count": c.get("like_count", 0),
            "dislike_count": c.get("dislike_count", 0),
            "my_reaction": my_by_target.get(str(c["_id"]), 0),
            "created_at": c["created_at"],
        }
        for c in comments
    ]


@router.post("/{response_id}/comments")
async def add_comment(
    response_id: str, body: CommentCreate, user: dict = Depends(current_user)
):
    db = get_db()
    r = await db.responses.find_one({"_id": ObjectId(response_id)})
    if not r or not r.get("is_public"):
        raise HTTPException(404, "Not found")
    if r["user_id"] == user["_id"]:
        raise HTTPException(400, "Can't comment on your own response")
    doc = {
        "response_id": response_id,
        "user_id": user["_id"],
        "user_name": user.get("name"),
        "user_picture": user.get("picture"),
        "body": body.body.strip(),
        "like_count": 1,
        "dislike_count": 0,
        "created_at": datetime.now(timezone.utc),
    }
    res = await db.comments.insert_one(doc)
    comment_id = str(res.inserted_id)
    # Auto-upvote own comment
    await db.reactions.update_one(
        {"target_type": "comment", "target_id": comment_id, "user_id": user["_id"]},
        {"$set": {"value": 1, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    # The self-upvote contributes to the author's karma — recompute now so
    # the Navbar + profile reflect the new value on next /auth/me.
    await _recompute_comment_karma(db, user["_id"])
    return {"id": comment_id, **{k: v for k, v in doc.items() if k != "_id"}}


@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, user: dict = Depends(current_user)):
    db = get_db()
    c = await db.comments.find_one({"_id": ObjectId(comment_id)})
    if not c:
        raise HTTPException(404, "Not found")
    if c["user_id"] != user["_id"]:
        raise HTTPException(403, "Not your comment")
    # Remove reactions then the comment
    await db.reactions.delete_many({"target_type": "comment", "target_id": comment_id})
    await db.comments.delete_one({"_id": ObjectId(comment_id)})
    await _recompute_comment_karma(db, c["user_id"])
    return {"ok": True}


# ---------- Ratings ----------
@router.post("/{response_id}/rate")
async def rate_response(
    response_id: str, body: RatingCreate, user: dict = Depends(current_user)
):
    db = get_db()
    r = await db.responses.find_one({"_id": ObjectId(response_id)})
    if not r or not r.get("is_public"):
        raise HTTPException(404, "Not found")
    if r["user_id"] == user["_id"]:
        raise HTTPException(400, "Can't rate your own response")

    category_scores = {
        "structure_star": body.structure_star,
        "specificity_depth": body.specificity_depth,
        "delivery_pacing": body.delivery_pacing,
        "relevance": body.relevance,
        "reflection": body.reflection,
    }
    avg_of_five = sum(category_scores.values()) / 5

    await db.ratings.update_one(
        {"response_id": response_id, "user_id": user["_id"]},
        {
            "$set": {
                **category_scores,
                "avg": avg_of_five,
                "updated_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )

    # Recompute aggregates across all raters
    pipeline = [
        {"$match": {"response_id": response_id}},
        {"$group": {"_id": None, "avg": {"$avg": "$avg"}, "count": {"$sum": 1}}},
    ]
    agg = [a async for a in db.ratings.aggregate(pipeline)]
    avg = round(agg[0]["avg"], 2) if agg else None
    count = agg[0]["count"] if agg else 0
    await db.responses.update_one(
        {"_id": ObjectId(response_id)},
        {"$set": {"avg_rating": avg, "rating_count": count}},
    )
    return {"ok": True, "avg_rating": avg, "rating_count": count}


@router.delete("/{response_id}/rate")
async def delete_rating(response_id: str, user: dict = Depends(current_user)):
    db = get_db()
    r = await db.responses.find_one({"_id": ObjectId(response_id)})
    if not r or not r.get("is_public"):
        raise HTTPException(404, "Not found")
    if r["user_id"] == user["_id"]:
        raise HTTPException(400, "Can't rate your own response")
    await db.ratings.delete_one({"response_id": response_id, "user_id": user["_id"]})
    pipeline = [
        {"$match": {"response_id": response_id}},
        {"$group": {"_id": None, "avg": {"$avg": "$avg"}, "count": {"$sum": 1}}},
    ]
    agg = [a async for a in db.ratings.aggregate(pipeline)]
    avg = round(agg[0]["avg"], 2) if agg else None
    count = agg[0]["count"] if agg else 0
    await db.responses.update_one(
        {"_id": ObjectId(response_id)},
        {"$set": {"avg_rating": avg, "rating_count": count}},
    )
    return {"ok": True, "avg_rating": avg, "rating_count": count}


# ---------- Comment reactions (karma voting) ----------
async def _recompute_comment_karma(db, author_id: str) -> int:
    """Karma = net sum of reaction values across all of this user's comments.
    Sets the user's karma to the fresh value and returns it."""
    comment_ids = [
        str(cc["_id"])
        async for cc in db.comments.find({"user_id": author_id}, {"_id": 1})
    ]
    if not comment_ids:
        karma = 0
    else:
        agg = [
            a
            async for a in db.reactions.aggregate([
                {"$match": {"target_type": "comment", "target_id": {"$in": comment_ids}}},
                {"$group": {"_id": None, "karma": {"$sum": "$value"}}},
            ])
        ]
        karma = agg[0]["karma"] if agg else 0
    await db.users.update_one(
        {"_id": ObjectId(author_id)}, {"$set": {"karma": karma}}
    )
    return karma


async def _apply_comment_reaction(
    db, comment_id: str, user_id: str, value: int
):
    existing = await db.reactions.find_one(
        {"target_type": "comment", "target_id": comment_id, "user_id": user_id}
    )
    prev = existing["value"] if existing else 0

    if value == 0:
        await db.reactions.delete_one(
            {"target_type": "comment", "target_id": comment_id, "user_id": user_id}
        )
    else:
        await db.reactions.update_one(
            {"target_type": "comment", "target_id": comment_id, "user_id": user_id},
            {"$set": {"value": value, "updated_at": datetime.now(timezone.utc)}},
            upsert=True,
        )

    inc = {}
    if prev == 1:
        inc["like_count"] = inc.get("like_count", 0) - 1
    elif prev == -1:
        inc["dislike_count"] = inc.get("dislike_count", 0) - 1
    if value == 1:
        inc["like_count"] = inc.get("like_count", 0) + 1
    elif value == -1:
        inc["dislike_count"] = inc.get("dislike_count", 0) + 1
    if inc:
        await db.comments.update_one({"_id": ObjectId(comment_id)}, {"$inc": inc})


@router.post("/comments/{comment_id}/react")
async def react_comment(
    comment_id: str, body: ReactionCreate, user: dict = Depends(current_user)
):
    db = get_db()
    c = await db.comments.find_one({"_id": ObjectId(comment_id)})
    if not c:
        raise HTTPException(404, "Not found")
    await _apply_comment_reaction(db, comment_id, user["_id"], body.value)
    await _recompute_comment_karma(db, c["user_id"])
    doc = await db.comments.find_one({"_id": ObjectId(comment_id)})
    return {
        "like_count": doc.get("like_count", 0),
        "dislike_count": doc.get("dislike_count", 0),
    }
