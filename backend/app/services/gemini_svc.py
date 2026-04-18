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


GENERATE_PROMPT = """You are a senior recruiter assembling a set of REAL behavioral
interview questions{target_clause}.

Your job: return exactly {count} distinct behavioral interview questions.
Focus strictly on behavioral — leadership, collaboration, conflict, ownership,
failure, learning, ambiguity, trade-offs. NOT technical/coding questions.

STRONG PREFERENCE: use questions that are actually reported in the web-search
snippets below (Glassdoor, LeetCode discuss, Blind, interview blogs). If a
snippet mentions a specific question a candidate was asked, use it AS-IS
(you may lightly clean up punctuation/grammar, strip filler like "They asked
me"). Do NOT invent generic-sounding questions when the snippets provide
concrete ones.

Only fall back to synthesized questions if the snippets are too high-level to
contain specific questions. When you do synthesize, match the style of what
candidates have reported for this context.

{company_guidance}

Web context:
---
{context}
---

Return ONLY a JSON array of objects with this exact shape — no prose, no
markdown, no preamble:
[
  {{"text": "<the full question>", "tags": ["<tag1>", "<tag2>"]}}
]
Tags should be short lowercase keywords (leadership, conflict, failure, etc.).
If the question is drawn from a specific company's known style, include the
company name (lowercased) as a tag.
"""


COMPANY_STYLE_HINTS = {
    "amazon": "Amazon behavioral interviews revolve around the 16 Leadership Principles (Customer Obsession, Ownership, Invent and Simplify, Are Right A Lot, Learn and Be Curious, Hire and Develop, Insist on the Highest Standards, Think Big, Bias for Action, Frugality, Earn Trust, Dive Deep, Have Backbone/Disagree and Commit, Deliver Results). Questions almost always map to one of these principles. Prefer concrete reported questions like 'Tell me about a time you disagreed with a decision and committed anyway' or 'Describe a time you had to earn trust from a skeptical stakeholder.'",
    "google": "Google's behavioral loop tests 'Googleyness' (comfort with ambiguity, intellectual humility, collaboration) and General Cognitive Ability in a behavioral frame. Common reported questions: 'Tell me about a time you had to work with a difficult teammate', 'Describe a time you changed someone's mind', 'Give an example of when you had to make a decision without enough information.'",
    "meta": "Meta (Facebook) focuses on ownership, conflict resolution, and moving fast. Common reported questions: 'Tell me about a time you disagreed with your manager', 'Describe a time you shipped something fast and iterated', 'Tell me about a time you took on something outside your role.'",
    "facebook": "Meta (Facebook) focuses on ownership, conflict resolution, and moving fast.",
    "apple": "Apple behavioral interviews emphasize attention to detail, craft, and high standards. Common reported questions: 'Describe a project you're most proud of and what made it great', 'Tell me about a time you disagreed with a design decision.'",
    "microsoft": "Microsoft emphasizes growth mindset and collaboration across teams. Common reported questions: 'Tell me about a time you had to learn something new quickly', 'Describe a time you changed your mind based on feedback.'",
    "netflix": "Netflix centers on their culture memo values — judgment, courage, selflessness, impact. Common reported questions: 'Tell me about a time you made a high-judgment call with limited information', 'Describe a time you gave someone hard feedback.'",
    "stripe": "Stripe values rigor, ownership, and craft. Expect deep dives on one or two projects. 'Walk me through a project you owned end-to-end.'",
    "airbnb": "Airbnb emphasizes host/guest empathy and core values. 'Tell me about a time you championed the customer.'",
}


def _company_hint(company: str | None) -> str:
    if not company:
        return "Keep the questions broadly applicable to a senior individual-contributor role."
    key = company.strip().lower()
    hint = COMPANY_STYLE_HINTS.get(key)
    if hint:
        return hint
    return (
        f"Tailor the questions to {company}'s interview style if the snippets "
        f"reveal it; otherwise use generally applicable behavioral questions "
        f"that match what candidates at similar companies report."
    )


def _format_context(snippets: list[dict], limit: int = 8) -> str:
    if not snippets:
        return "(no web context available — rely on general knowledge of behavioral interviewing)"
    parts = []
    for i, s in enumerate(snippets[:limit]):
        title = s.get("title") or ""
        desc = s.get("description") or ""
        parts.append(f"[{i + 1}] {title}\n{desc}")
    return "\n\n".join(parts)


async def generate_questions(
    count: int, company: str | None, snippets: list[dict]
) -> list[dict]:
    """Use Gemini to synthesize N behavioral questions from Brave snippets."""
    target_clause = f" for a role at {company}" if company else ""
    company_guidance = _company_hint(company)

    prompt = GENERATE_PROMPT.format(
        count=count,
        target_clause=target_clause,
        company_guidance=company_guidance,
        context=_format_context(snippets, limit=15),
    )

    if not settings.GEMINI_API_KEY:
        return _mock_generated_questions(count, company)

    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.8,
            "responseMimeType": "application/json",
        },
    }
    url = GEMINI_URL.format(model=settings.GEMINI_MODEL, key=settings.GEMINI_API_KEY)
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, json=body)
        r.raise_for_status()
        data = r.json()

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Unexpected Gemini response: {data}") from e

    m = re.search(r"\[.*\]", text, re.DOTALL)
    if not m:
        raise RuntimeError(f"No JSON array in Gemini response: {text[:200]}")
    arr = json.loads(m.group(0))

    out: list[dict] = []
    for item in arr[:count]:
        if not isinstance(item, dict):
            continue
        t = (item.get("text") or "").strip()
        if not t:
            continue
        tags = item.get("tags") or []
        if isinstance(tags, str):
            tags = [tags]
        out.append({"text": t, "tags": [str(x).lower() for x in tags]})
    return out


def _mock_generated_questions(count: int, company: str | None) -> list[dict]:
    base = [
        {"text": "Tell me about a time you disagreed with a teammate and how you resolved it.", "tags": ["conflict"]},
        {"text": "Describe a project where you took ownership of something outside your scope.", "tags": ["ownership"]},
        {"text": "Give an example of a time you had to make a decision under uncertainty.", "tags": ["ambiguity"]},
        {"text": "Tell me about a time you failed and what you learned.", "tags": ["failure", "learning"]},
        {"text": "Describe a situation where you had to influence without authority.", "tags": ["influence"]},
    ]
    picked = base[:count]
    if company:
        for q in picked:
            q["tags"] = q["tags"] + [company.lower()]
    return picked
