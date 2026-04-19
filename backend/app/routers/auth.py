from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import create_jwt, current_user, verify_google_id_token
from ..db import get_db
from ..rooms import manager as room_manager

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
    code, room_name = await _resolve_current_room(db, user_id, user_doc.get("current_room_code") if user_doc else None)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "karma": user_doc.get("karma", 0) if user_doc else 0,
            "current_room_code": code,
            "current_room_name": room_name,
        },
    }


@router.get("/me")
async def me(user: dict = Depends(current_user)):
    db = get_db()
    code, room_name = await _resolve_current_room(db, user["_id"], user.get("current_room_code"))
    return {
        "id": user["_id"],
        "email": user.get("email"),
        "name": user.get("name"),
        "picture": user.get("picture"),
        "karma": user.get("karma", 0),
        "current_room_code": code,
        "current_room_name": room_name,
    }


async def _resolve_current_room(db, user_id: str, code: str | None) -> tuple[str | None, str | None]:
    """Return (code, name) of the user's active room. If the stored code
    points at a room that no longer exists (closed), clear it on the user
    doc and return (None, None) so clients stop showing a stale banner."""
    if not code:
        return None, None
    room = room_manager.get(code)
    if room is None:
        await db.users.update_one(
            {"_id": ObjectId(user_id)}, {"$set": {"current_room_code": None}}
        )
        return None, None
    return room.code, room.name
