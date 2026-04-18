from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import create_jwt, current_user, verify_google_id_token
from ..db import get_db

router = APIRouter()


class GoogleLoginBody(BaseModel):
    credential: str  # the JWT string returned by Google Identity Services


@router.post("/google")
async def google_login(body: GoogleLoginBody):
    info = verify_google_id_token(body.credential)
    sub = info["sub"]
    email = info.get("email")
    name = info.get("name") or email or "Anonymous"
    picture = info.get("picture")

    db = get_db()
    existing = await db.users.find_one({"google_sub": sub})
    if existing:
        user_id = str(existing["_id"])
        await db.users.update_one(
            {"_id": existing["_id"]},
            {"$set": {"name": name, "picture": picture, "email": email}},
        )
    else:
        doc = {
            "google_sub": sub,
            "email": email,
            "name": name,
            "picture": picture,
            "karma": 0,
            "created_at": datetime.now(timezone.utc),
        }
        res = await db.users.insert_one(doc)
        user_id = str(res.inserted_id)

    token = create_jwt(user_id)
    user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "karma": user_doc.get("karma", 0) if user_doc else 0,
        },
    }


@router.get("/me")
async def me(user: dict = Depends(current_user)):
    return {
        "id": user["_id"],
        "email": user.get("email"),
        "name": user.get("name"),
        "picture": user.get("picture"),
        "karma": user.get("karma", 0),
    }
