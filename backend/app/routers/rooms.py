"""HTTP + WebSocket endpoints for multiplayer competition rooms."""
from __future__ import annotations

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from ..auth import current_user, decode_jwt
from ..db import get_db
from ..rooms import Player, RoomSettings, manager

router = APIRouter()


class RoomSettingsBody(BaseModel):
    question_count: int = Field(default=3, ge=1, le=10)
    max_response_seconds: int = Field(default=180, ge=30, le=600)
    categories: list[str] = []
    company: str | None = None
    max_players: int = Field(default=8, ge=2, le=20)
    between_rounds_seconds: int = Field(default=3, ge=0, le=30)


class CreateRoomBody(BaseModel):
    name: str = Field(default="", min_length=1, max_length=40)
    is_public: bool = True
    settings: RoomSettingsBody = RoomSettingsBody()


def _settings_from_body(body: RoomSettingsBody) -> RoomSettings:
    return RoomSettings(
        question_count=body.question_count,
        max_response_seconds=body.max_response_seconds,
        categories=list(body.categories or []),
        company=(body.company.strip() if body.company else None) or None,
        max_players=body.max_players,
        between_rounds_seconds=body.between_rounds_seconds,
    )


# ---------- HTTP ----------
@router.post("")
async def create_room(body: CreateRoomBody, user: dict = Depends(current_user)):
    settings = _settings_from_body(body.settings)
    try:
        room = await manager.create(
            host_user_id=user["_id"],
            is_public=body.is_public,
            settings=settings,
            name=body.name,
        )
    except ValueError as e:
        raise HTTPException(409, str(e))
    return {"code": room.code, "room": room.public_state()}


@router.get("")
async def list_rooms(_user: dict = Depends(current_user)):
    return manager.list_public()


@router.get("/{code}")
async def get_room(code: str, _user: dict = Depends(current_user)):
    room = manager.get(code)
    if not room:
        raise HTTPException(404, "Room not found")
    return room.public_state()


# ---------- Questions picker (reuses existing logic) ----------
async def _pick_questions(settings: RoomSettings) -> list[dict]:
    db = get_db()
    match: dict = {}
    if settings.categories:
        match["category"] = {"$in": settings.categories}
    pipeline: list[dict] = []
    if match:
        pipeline.append({"$match": match})
    pipeline.append({"$sample": {"size": settings.question_count}})
    docs = [d async for d in db.questions.aggregate(pipeline)]
    if not docs:
        pipeline = [{"$sample": {"size": settings.question_count}}]
        docs = [d async for d in db.questions.aggregate(pipeline)]
    return [
        {
            "id": str(d["_id"]),
            "text": d["text"],
            "category": d.get("category", ""),
        }
        for d in docs
    ]


# ---------- WebSocket ----------
@router.websocket("/{code}/ws")
async def room_ws(websocket: WebSocket, code: str, token: str = Query(...)):
    # Auth via ?token=<JWT> since WS browsers can't send Authorization.
    try:
        payload = decode_jwt(token)
        user_id = payload["sub"]
    except Exception:
        await websocket.close(code=4401)
        return

    db = get_db()
    user_doc = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user_doc:
        await websocket.close(code=4401)
        return

    room = manager.get(code)
    if not room:
        # Room no longer exists — clear any stale "currently in this room"
        # pointer on the user so the frontend won't keep nagging them to
        # return to a dead room.
        if (user_doc.get("current_room_code") or "").upper() == code.upper():
            await db.users.update_one(
                {"_id": ObjectId(user_id)}, {"$set": {"current_room_code": None}}
            )
        await websocket.close(code=4404)
        return

    player = Player(
        user_id=user_id,
        name=user_doc.get("name") or user_doc.get("email") or "Player",
        picture=user_doc.get("picture"),
        ws=websocket,
    )

    await websocket.accept()
    try:
        await manager.join(room, player)
    except RuntimeError as e:
        await websocket.send_json({"type": "error", "message": str(e)})
        await websocket.close()
        return

    # Persist "currently in this room" on the user doc. Cleared only on
    # explicit leave (below) or when rejoining a dead room (above).
    await db.users.update_one(
        {"_id": ObjectId(user_id)}, {"$set": {"current_room_code": room.code}}
    )

    mtype: str | None = None
    try:
        while True:
            msg = await websocket.receive_json()
            mtype = msg.get("type")

            if mtype == "settings":
                if room.host_user_id != user_id:
                    continue
                try:
                    body = RoomSettingsBody(**(msg.get("settings") or {}))
                except Exception as e:
                    await websocket.send_json({"type": "error", "message": f"bad settings: {e}"})
                    continue
                await manager.update_settings(room, _settings_from_body(body))

            elif mtype == "start":
                if room.host_user_id != user_id:
                    continue
                if room.status != "lobby":
                    continue
                try:
                    questions = await _pick_questions(room.settings)
                except Exception as e:
                    await websocket.send_json(
                        {"type": "error", "message": f"Could not pick questions: {e}"}
                    )
                    continue
                await manager.start(room, questions)

            elif mtype == "submit_score":
                try:
                    qidx = int(msg.get("question_index"))
                    overall = msg.get("overall")
                    if overall is not None:
                        overall = float(overall)
                except (TypeError, ValueError):
                    continue
                await manager.submit_score(room, user_id, qidx, overall)

            elif mtype == "return":
                # Player ack'd being back in the lobby. First caller after a
                # finished game also triggers the room-to-lobby reset.
                await manager.mark_returned(room, user_id)

            elif mtype == "leave":
                break

            elif mtype == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[rooms ws] unexpected: {e}")
    finally:
        # If user explicitly sent "leave", remove them and clear the DB
        # pointer. Otherwise just mark disconnected so they can rejoin.
        if mtype == "leave":
            await manager.remove(room, user_id)
            await db.users.update_one(
                {"_id": ObjectId(user_id)}, {"$set": {"current_room_code": None}}
            )
        else:
            await manager.mark_disconnected(room, user_id)
