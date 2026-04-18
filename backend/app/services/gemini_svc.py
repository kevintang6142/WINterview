from __future__ import annotations

import json
import re
from typing import Any

import httpx

from ..config import settings

FILLER_WORDS = [
    "um",
    "uh",
    "uhh",
    "umm",
    "er",
    "erm",
    "ah",
    "like",
    "you know",
    "i mean",
    "sort of",
    "kind of",
    "basically",
    "literally",
    "actually",
    "so yeah",
    "right",
]

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent?key={key}"
)

RUBRIC_PROMPT = """You are a strict but fair interview coach. Evaluate the candidate's
spoken response to a behavioral interview question. Score each metric 0-5 (one decimal allowed).

Metrics (be careful to keep them distinct):

1. structure_star — Does the response follow the STAR method (Situation, Task, Action, Result)?
   Penalize missing components or jumbled ordering. Ignore delivery issues here.
2. specificity_depth — Are there concrete details (names, numbers, tools, timeframes, stakes)
   versus vague generalities? Ignore structure.
3. delivery_pacing — Speech delivery: pacing (not too fast/slow) and low filler-word density.
   Use the provided pacing stats. Ignore content quality.
4. relevance — Does the answer actually address the *specific* question asked, not a tangentially
   related story? Ignore how well structured or detailed it is.
5. reflection — Self-awareness, what they learned, or what they'd do differently. This is
   distinct from STAR's "Result" (outcome) — reflection is meta-cognition.

For each metric return {"score": <0-5 number>, "feedback": "<one concise sentence>"}.
Also return:
- overall: numerical average of the 5 scores (one decimal).
- summary: 1-2 sentence overall verdict.
- strengths: 2-3 bullet strings.
- improvements: 2-3 bullet strings.

Return ONLY JSON matching this exact schema, no prose, no markdown:
{
  "structure_star": {"score": number, "feedback": string},
  "specificity_depth": {"score": number, "feedback": string},
  "delivery_pacing": {"score": number, "feedback": string},
  "relevance": {"score": number, "feedback": string},
  "reflection": {"score": number, "feedback": string},
  "overall": number,
  "summary": string,
  "strengths": [string],
  "improvements": [string]
}
"""


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-z']+", text.lower())


def analyze_pacing(transcript: str, duration_seconds: float) -> dict[str, Any]:
    words = _tokenize(transcript)
    word_count = len(words)
    duration = max(duration_seconds, 1.0)

    # filler word counts (phrases handled by substring match on the normalized transcript)
    normalized = " " + re.sub(r"[^a-z' ]", " ", transcript.lower()) + " "
    filler_words: dict[str, int] = {}
    filler_count = 0
    for fw in FILLER_WORDS:
        pat = r"\b" + re.escape(fw) + r"\b"
        n = len(re.findall(pat, normalized))
        if n:
            filler_words[fw] = n
            filler_count += n

    wpm = word_count / (duration / 60.0) if duration > 0 else 0.0

    # 10 equal-length buckets — used for the pacing graph on the frontend.
    buckets = 10
    timeline: list[float] = []
    if word_count > 0:
        per_bucket = max(1, word_count // buckets)
        per_bucket_seconds = duration / buckets
        for i in range(buckets):
            start = i * per_bucket
            end = start + per_bucket if i < buckets - 1 else word_count
            bucket_words = end - start
            timeline.append(bucket_words / (per_bucket_seconds / 60.0))
    else:
        timeline = [0.0] * buckets

    return {
        "filler_count": filler_count,
        "filler_words": filler_words,
        "word_count": word_count,
        "duration_seconds": duration,
        "words_per_minute": round(wpm, 1),
        "pacing_timeline": [round(x, 1) for x in timeline],
    }


def _extract_json(text: str) -> dict:
    # Gemini sometimes wraps JSON in a fenced block even when told not to.
    text = text.strip()
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        raise ValueError(f"No JSON object in Gemini response: {text[:200]}")
    return json.loads(m.group(0))


async def evaluate_response(question: str, transcript: str, pacing: dict) -> dict:
    if not settings.GEMINI_API_KEY:
        # Fallback: return a mocked evaluation so the app remains usable without a key.
        return _mock_evaluation(pacing)

    user_payload = {
        "question": question,
        "transcript": transcript,
        "pacing_stats": {
            "words_per_minute": pacing["words_per_minute"],
            "filler_count": pacing["filler_count"],
            "word_count": pacing["word_count"],
            "duration_seconds": pacing["duration_seconds"],
        },
    }

    body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": RUBRIC_PROMPT},
                    {"text": json.dumps(user_payload)},
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "responseMimeType": "application/json",
        },
    }
    url = GEMINI_URL.format(model=settings.GEMINI_MODEL, key=settings.GEMINI_API_KEY)
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(url, json=body)
        r.raise_for_status()
        data = r.json()

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Unexpected Gemini response: {data}") from e

    parsed = _extract_json(text)
    return parsed


def _mock_evaluation(pacing: dict) -> dict:
    """Deterministic stand-in so the UI works before a Gemini key is set."""
    def m(score: float, msg: str):
        return {"score": score, "feedback": msg}
    return {
        "structure_star": m(3.5, "(mock) Add your GEMINI_API_KEY to .env for real scoring."),
        "specificity_depth": m(3.0, "(mock) Add more concrete numbers and names."),
        "delivery_pacing": m(
            3.5,
            f"(mock) You used {pacing['filler_count']} filler words at ~{pacing['words_per_minute']} WPM.",
        ),
        "relevance": m(3.5, "(mock) Sounds on-topic."),
        "reflection": m(3.0, "(mock) Mention what you learned."),
        "overall": 3.3,
        "summary": "Mock evaluation — set GEMINI_API_KEY in .env to enable real scoring.",
        "strengths": ["(mock) Clear delivery", "(mock) Relevant topic"],
        "improvements": ["(mock) Add specific metrics", "(mock) Name the STAR sections explicitly"],
    }


def merge_evaluation(gemini_result: dict, pacing: dict) -> dict:
    """Combine AI scores with locally computed pacing stats."""
    return {**gemini_result, **pacing}
