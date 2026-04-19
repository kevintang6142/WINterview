"""In-memory room manager for multiplayer interview competitions.

Rooms live for the duration of the process — that's fine for a casual
competitive mode and keeps the feature free to run.
"""
from __future__ import annotations

import asyncio
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal

from fastapi import WebSocket

RoomStatus = Literal["lobby", "running", "finished"]

# Exclude confusing characters (0/O, 1/I/L).
_CODE_ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _gen_code(n: int = 6) -> str:
    return "".join(secrets.choice(_CODE_ALPHA) for _ in range(n))


@dataclass
class RoomSettings:
    question_count: int = 3
    max_response_seconds: int = 180
    categories: list[str] = field(default_factory=list)
    company: str | None = None
    max_players: int = 8
    # Countdown shown between rounds before the next question appears.
    between_rounds_seconds: int = 3


@dataclass
class Player:
    user_id: str
    name: str
    picture: str | None = None
    ws: WebSocket | None = None
    # score per question (None = not submitted yet / skipped)
    scores: list[float | None] = field(default_factory=list)
    ready: bool = False  # submitted for current question
    connected: bool = True


@dataclass
class Room:
    code: str
    name: str
    is_public: bool
    host_user_id: str
    settings: RoomSettings = field(default_factory=RoomSettings)
    status: RoomStatus = "lobby"
    players: dict[str, Player] = field(default_factory=dict)
    # [{"id": str, "text": str, "category": str}]
    questions: list[dict] = field(default_factory=list)
    current_index: int = -1
    # unix seconds when current round auto-advances
    round_deadline: float | None = None
    # unix seconds until the next question starts (set during between-rounds gap)
    intermission_until: float | None = None
    # asyncio task for the current round's timeout
    _round_task: asyncio.Task | None = field(default=None, repr=False)
    # asyncio task that closes the room after everyone's gone; cancelled if
    # anyone reconnects within the grace period.
    _close_task: asyncio.Task | None = field(default=None, repr=False)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def public_state(self) -> dict:
        return {
            "code": self.code,
            "name": self.name,
            "is_public": self.is_public,
            "host_user_id": self.host_user_id,
            "settings": {
                "question_count": self.settings.question_count,
                "max_response_seconds": self.settings.max_response_seconds,
                "categories": self.settings.categories,
                "company": self.settings.company,
                "max_players": self.settings.max_players,
                "between_rounds_seconds": self.settings.between_rounds_seconds,
            },
            "status": self.status,
            "players": [
                {
                    "user_id": p.user_id,
                    "name": p.name,
                    "picture": p.picture,
                    "scores": p.scores,
                    "ready": p.ready,
                    "connected": p.connected,
                }
                for p in self.players.values()
            ],
            "current_index": self.current_index,
            "current_question": (
                self.questions[self.current_index]
                if 0 <= self.current_index < len(self.questions)
                else None
            ),
            "round_deadline": self.round_deadline,
            "intermission_until": self.intermission_until,
            "questions_total": (
                len(self.questions) if self.questions else self.settings.question_count
            ),
        }


def _leaderboard(room: Room) -> list[dict]:
    board = []
    for p in room.players.values():
        scored = [s for s in p.scores if s is not None]
        total = sum(scored)
        avg = total / len(scored) if scored else 0.0
        board.append(
            {
                "user_id": p.user_id,
                "name": p.name,
                "picture": p.picture,
                "scores": p.scores,
                "total": round(total, 2),
                "avg": round(avg, 2),
            }
        )
    board.sort(key=lambda x: x["total"], reverse=True)
    return board


class RoomManager:
    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}
        self._lock = asyncio.Lock()

    # ---------- Querying ----------
    def get(self, code: str) -> Room | None:
        return self.rooms.get(code.upper())

    def list_public(self) -> list[dict]:
        out = []
        for r in self.rooms.values():
            # Include lobby + running so people can see active games in progress.
            # Finished rooms are effectively over — skip them.
            if not r.is_public or r.status == "finished":
                continue
            host = r.players.get(r.host_user_id)
            total_questions = (
                len(r.questions) if r.questions else r.settings.question_count
            )
            out.append(
                {
                    "code": r.code,
                    "name": r.name,
                    "host_name": host.name if host else None,
                    "player_count": len(r.players),
                    "max_players": r.settings.max_players,
                    "status": r.status,
                    "company": r.settings.company,
                    "question_count": r.settings.question_count,
                    # 0-based internally, expose a human-friendly 1-based index
                    # (1 when a running room is on question 1 of N).
                    "current_round": (r.current_index + 1) if r.status == "running" else None,
                    "total_rounds": total_questions,
                    "created_at": r.created_at.isoformat(),
                }
            )
        # Lobby rooms first (joinable); then running rooms. Each group
        # newest-first — relies on Python's sort being stable.
        out.sort(key=lambda x: x["created_at"], reverse=True)
        out.sort(key=lambda x: 0 if x["status"] == "lobby" else 1)
        return out

    # ---------- Lifecycle ----------
    async def create(
        self,
        *,
        host_user_id: str,
        is_public: bool,
        settings: RoomSettings,
        name: str,
    ) -> Room:
        name = (name or "").strip()
        if not name:
            raise ValueError("Room name is required")
        if len(name) > 40:
            raise ValueError("Room name must be 40 characters or fewer")
        async with self._lock:
            # Name must be unique among active rooms (case-insensitive).
            existing_names = {r.name.lower() for r in self.rooms.values()}
            if name.lower() in existing_names:
                raise ValueError(f"A room named '{name}' already exists")
            for _ in range(20):
                code = _gen_code()
                if code not in self.rooms:
                    break
            else:
                raise RuntimeError("Could not generate unique room code")
            room = Room(
                code=code,
                name=name,
                is_public=is_public,
                host_user_id=host_user_id,
                settings=settings,
            )
            self.rooms[code] = room
            return room

    async def broadcast(self, room: Room, message: dict) -> None:
        for p in list(room.players.values()):
            if not p.ws or not p.connected:
                continue
            try:
                await p.ws.send_json(message)
            except Exception:
                p.connected = False

    async def _snapshot(self, room: Room) -> None:
        await self.broadcast(room, {"type": "state", "room": room.public_state()})

    async def join(self, room: Room, player: Player) -> None:
        # Someone showed up — cancel any pending close-after-grace timer.
        self._cancel_close(room)
        existing = room.players.get(player.user_id)
        if existing:
            # Re-connect: take over with the new socket.
            existing.ws = player.ws
            existing.name = player.name
            existing.picture = player.picture
            existing.connected = True
        else:
            if len(room.players) >= room.settings.max_players:
                raise RuntimeError("Room is full")
            if room.status != "lobby":
                raise RuntimeError("Room already started")
            room.players[player.user_id] = player
        await self._snapshot(room)

    async def mark_disconnected(self, room: Room, user_id: str) -> None:
        p = room.players.get(user_id)
        if not p:
            return
        p.connected = False
        # If the host disconnects, pass the crown to the first connected
        # player so the lobby/game isn't stuck host-less. The original user
        # can reclaim their slot on reconnect but won't get host back.
        if room.host_user_id == user_id:
            next_host = next(
                (pid for pid, pl in room.players.items() if pl.connected),
                None,
            )
            if next_host:
                room.host_user_id = next_host
        # Don't remove from players so they can reconnect mid-game.
        await self._snapshot(room)
        # If nobody's connected, start the 10s grace timer instead of closing
        # immediately. A reconnect or join will cancel it.
        if not any(pl.connected for pl in room.players.values()):
            self._schedule_close(room)

    async def remove(self, room: Room, user_id: str) -> None:
        """Explicit leave (user clicked Leave). Remove them fully."""
        room.players.pop(user_id, None)
        if not room.players:
            # Same 10s grace window for explicit leaves — a quick change of
            # mind shouldn't nuke the room.
            self._schedule_close(room)
            return
        if room.host_user_id == user_id:
            # Transfer host to the next connected player (or any remaining).
            next_host = next(
                (pid for pid, pl in room.players.items() if pl.connected),
                next(iter(room.players.keys())),
            )
            room.host_user_id = next_host
        await self._snapshot(room)

    # ---------- Close-after-grace ----------
    CLOSE_GRACE_SECONDS: float = 10.0

    def _schedule_close(self, room: Room) -> None:
        if room._close_task and not room._close_task.done():
            return  # Already counting down
        room._close_task = asyncio.create_task(self._close_after(room))

    def _cancel_close(self, room: Room) -> None:
        if room._close_task and not room._close_task.done():
            room._close_task.cancel()
        room._close_task = None

    async def _close_after(self, room: Room) -> None:
        try:
            await asyncio.sleep(self.CLOSE_GRACE_SECONDS)
            # Still empty? Then close for real. Someone may have reconnected
            # OR joined a fresh user in the grace window, in which case skip.
            if any(pl.connected for pl in room.players.values()):
                return
            if room._round_task and not room._round_task.done():
                room._round_task.cancel()
            self.rooms.pop(room.code, None)
        except asyncio.CancelledError:
            pass

    # ---------- Settings ----------
    async def update_settings(self, room: Room, settings: RoomSettings) -> None:
        if room.status != "lobby":
            return
        room.settings = settings
        await self._snapshot(room)

    # ---------- Round flow ----------
    async def start(self, room: Room, questions: list[dict]) -> None:
        if room.status != "lobby":
            return
        if not questions:
            raise RuntimeError("No questions for room")
        room.questions = questions
        room.status = "running"
        room.current_index = 0
        for p in room.players.values():
            p.scores = [None] * len(questions)
            p.ready = False
        room.round_deadline = time.time() + room.settings.max_response_seconds + 30
        await self._snapshot(room)
        self._schedule_round_timeout(room)

    def _schedule_round_timeout(self, room: Room) -> None:
        if room._round_task and not room._round_task.done():
            room._round_task.cancel()
        room._round_task = asyncio.create_task(self._round_timeout(room, room.current_index))

    async def _round_timeout(self, room: Room, question_index: int) -> None:
        try:
            grace = room.settings.max_response_seconds + 30
            await asyncio.sleep(grace)
            # Still on the same round?
            if room.status != "running" or room.current_index != question_index:
                return
            # Mark any non-ready players as 0.0 and advance.
            for p in room.players.values():
                if not p.ready:
                    p.scores[question_index] = 0.0
                    p.ready = True
            await self._advance(room)
        except asyncio.CancelledError:
            pass

    async def submit_score(
        self, room: Room, user_id: str, question_index: int, overall: float | None
    ) -> None:
        if room.status != "running":
            return
        if question_index != room.current_index:
            return
        p = room.players.get(user_id)
        if not p or p.ready:
            return
        if overall is not None:
            overall = max(0.0, min(5.0, float(overall)))
        p.scores[question_index] = overall
        p.ready = True
        await self._snapshot(room)
        # Advance if everyone connected is done.
        if all(
            pl.ready or not pl.connected for pl in room.players.values()
        ) and any(pl.ready for pl in room.players.values()):
            await self._advance(room)

    async def _advance(self, room: Room) -> None:
        if room._round_task and not room._round_task.done():
            room._round_task.cancel()
        if room.current_index + 1 >= len(room.questions):
            room.status = "finished"
            room.round_deadline = None
            room.intermission_until = None
            await self.broadcast(
                room,
                {
                    "type": "finished",
                    "leaderboard": _leaderboard(room),
                    "room": room.public_state(),
                },
            )
            return

        # Between-rounds intermission — clients render a countdown.
        gap = max(0, int(room.settings.between_rounds_seconds or 0))
        if gap > 0:
            room.intermission_until = time.time() + gap
            room.round_deadline = None
            await self._snapshot(room)
            try:
                await asyncio.sleep(gap)
            except asyncio.CancelledError:
                return

        room.intermission_until = None
        room.current_index += 1
        for p in room.players.values():
            p.ready = False
        room.round_deadline = time.time() + room.settings.max_response_seconds + 30
        await self._snapshot(room)
        self._schedule_round_timeout(room)


manager = RoomManager()
