from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from .config import settings

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        if not settings.MONGO_URI:
            raise RuntimeError("MONGO_URI is not set. See MONGO_ATLAS_SETUP.md.")
        _client = AsyncIOMotorClient(settings.MONGO_URI)
    return _client


def get_db() -> AsyncIOMotorDatabase:
    return get_client()[settings.MONGO_DB]


async def ensure_indexes() -> None:
    db = get_db()
    await db.users.create_index("google_sub", unique=True)
    await db.users.create_index("email")
    await db.questions.create_index([("text", "text"), ("tags", "text")])
    await db.questions.create_index("slug", unique=True)
    await db.sessions.create_index("user_id")
    await db.responses.create_index("user_id")
    await db.responses.create_index("question_id")
    await db.responses.create_index("is_public")
    await db.responses.create_index([("created_at", -1)])
    await db.comments.create_index("response_id")
    await db.ratings.create_index([("response_id", 1), ("user_id", 1)], unique=True)
    await db.reactions.create_index(
        [("target_type", 1), ("target_id", 1), ("user_id", 1)], unique=True
    )
