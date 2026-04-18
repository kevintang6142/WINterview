from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import ensure_indexes
from .routers import auth, questions, responses, sessions, users, voice


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.MONGO_URI:
        try:
            await ensure_indexes()
        except Exception as e:
            print(f"[startup] index creation skipped: {e}")
    yield


app = FastAPI(title="WINterview API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"ok": True}


app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(questions.router, prefix="/questions", tags=["questions"])
app.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
app.include_router(responses.router, prefix="/responses", tags=["responses"])
app.include_router(voice.router, prefix="/voice", tags=["voice"])
