from __future__ import annotations

import io

import httpx

from ..config import settings

TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
TTS_TIMED_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps"
STT_URL = "https://api.elevenlabs.io/v1/speech-to-text"


async def tts_stream(text: str) -> bytes:
    """Synthesize speech for a question. Returns raw MP3 bytes."""
    if not settings.ELEVENLABS_API_KEY:
        raise RuntimeError("ELEVENLABS_API_KEY not configured")
    url = TTS_URL.format(voice_id=settings.ELEVENLABS_VOICE_ID)
    headers = {
        "xi-api-key": settings.ELEVENLABS_API_KEY,
        "accept": "audio/mpeg",
        "content-type": "application/json",
    }
    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {"stability": 0.4, "similarity_boost": 0.8},
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, headers=headers, json=payload)
        r.raise_for_status()
        return r.content


async def tts_with_timestamps(text: str) -> dict:
    """Synthesize speech and get character-level alignment.

    Returns:
        {
          "audio_base64": "...",
          "alignment": {
            "characters": ["H", "e", ...],
            "character_start_times_seconds": [0.0, ...],
            "character_end_times_seconds": [0.05, ...]
          },
          "words": [{"word": "Hello", "start": 0.0, "end": 0.4}, ...]
        }
    """
    if not settings.ELEVENLABS_API_KEY:
        raise RuntimeError("ELEVENLABS_API_KEY not configured")
    url = TTS_TIMED_URL.format(voice_id=settings.ELEVENLABS_VOICE_ID)
    headers = {
        "xi-api-key": settings.ELEVENLABS_API_KEY,
        "content-type": "application/json",
    }
    payload = {
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {"stability": 0.4, "similarity_boost": 0.8},
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(url, headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()

    # Group characters into word spans for easier frontend highlighting.
    alignment = data.get("alignment") or {}
    chars = alignment.get("characters") or []
    starts = alignment.get("character_start_times_seconds") or []
    ends = alignment.get("character_end_times_seconds") or []
    words: list[dict] = []
    current = ""
    w_start = 0.0
    w_end = 0.0
    for ch, s, e in zip(chars, starts, ends):
        if ch.isalnum() or ch == "'":
            if not current:
                w_start = s
            current += ch
            w_end = e
        else:
            if current:
                words.append({"word": current, "start": w_start, "end": w_end})
                current = ""
    if current:
        words.append({"word": current, "start": w_start, "end": w_end})

    return {
        "audio_base64": data.get("audio_base64"),
        "alignment": alignment,
        "words": words,
    }


async def stt_transcribe(audio_bytes: bytes, filename: str = "audio.webm") -> dict:
    """Transcribe an audio blob using ElevenLabs Scribe."""
    if not settings.ELEVENLABS_API_KEY:
        raise RuntimeError("ELEVENLABS_API_KEY not configured")
    headers = {"xi-api-key": settings.ELEVENLABS_API_KEY}
    files = {"file": (filename, io.BytesIO(audio_bytes), "application/octet-stream")}
    data = {"model_id": settings.ELEVENLABS_STT_MODEL}
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(STT_URL, headers=headers, data=data, files=files)
        r.raise_for_status()
        return r.json()
