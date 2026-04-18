from datetime import datetime
from typing import Any, Literal

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, EmailStr, Field


def oid_to_str(v: Any) -> str:
    return str(v) if isinstance(v, ObjectId) else v


class MongoBase(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
    )


# ---------- Users ----------
class UserPublic(MongoBase):
    id: str = Field(alias="_id")
    google_sub: str
    email: EmailStr
    name: str
    picture: str | None = None
    karma: int = 0
    created_at: datetime


# ---------- Questions ----------
class Question(MongoBase):
    id: str = Field(alias="_id")
    slug: str
    text: str
    tags: list[str] = []
    avg_rating: float | None = None
    response_count: int = 0


class QuestionCreate(BaseModel):
    text: str
    tags: list[str] = []


# ---------- Sessions ----------
class SessionCreate(BaseModel):
    mode: Literal["random", "selected"] = "random"
    count: int = Field(default=3, ge=1, le=5)
    question_ids: list[str] = []
    categories: list[str] = []
    # Optional. When set on random mode, backend uses Brave + Gemini to
    # pick which categories the company leans on and samples from those.
    company: str | None = None


class Session(MongoBase):
    id: str = Field(alias="_id")
    user_id: str
    mode: str
    question_ids: list[str]
    created_at: datetime
    completed_at: datetime | None = None


# ---------- Responses ----------
class MetricScore(BaseModel):
    score: float = Field(ge=0, le=5)
    feedback: str


class Evaluation(BaseModel):
    structure_star: MetricScore
    specificity_depth: MetricScore
    delivery_pacing: MetricScore
    relevance: MetricScore
    reflection: MetricScore
    overall: float = Field(ge=0, le=5)
    summary: str
    strengths: list[str] = []
    improvements: list[str] = []
    filler_count: int = 0
    filler_words: dict[str, int] = {}
    word_count: int = 0
    duration_seconds: float = 0.0
    words_per_minute: float = 0.0
    # 10-bucket timeline of WPM across the response, for the pacing graph.
    pacing_timeline: list[float] = []


class ResponseSubmit(BaseModel):
    session_id: str
    question_id: str
    transcript: str
    duration_seconds: float = 0.0
    word_timestamps: list[dict] = []  # [{"text": str, "start": float, "end": float}]


class ResponseDoc(MongoBase):
    id: str = Field(alias="_id")
    user_id: str
    session_id: str
    question_id: str
    transcript: str
    duration_seconds: float
    evaluation: Evaluation | None = None
    is_public: bool = False
    avg_rating: float | None = None
    rating_count: int = 0
    created_at: datetime


# ---------- Social ----------
class CommentCreate(BaseModel):
    body: str


class MasterySet(BaseModel):
    question_id: str
    state: str  # 'none' | 'in-progress' | 'mastered'


class Comment(MongoBase):
    id: str = Field(alias="_id")
    response_id: str
    user_id: str
    user_name: str
    user_picture: str | None = None
    body: str
    created_at: datetime


class RatingCreate(BaseModel):
    structure_star: int = Field(ge=1, le=5)
    specificity_depth: int = Field(ge=1, le=5)
    delivery_pacing: int = Field(ge=1, le=5)
    relevance: int = Field(ge=1, le=5)
    reflection: int = Field(ge=1, le=5)


class ReactionCreate(BaseModel):
    value: Literal[1, -1, 0]


class FeedItem(MongoBase):
    id: str = Field(alias="_id")
    question_id: str
    question_text: str
    transcript_preview: str
    overall_score: float | None
    avg_rating: float | None
    rating_count: int
    created_at: datetime
