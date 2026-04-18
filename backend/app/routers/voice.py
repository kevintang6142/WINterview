from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from ..auth import current_user
from ..services.elevenlabs_svc import stt_transcribe, tts_stream, tts_with_timestamps
from ..voices import VOICES, DEFAULT_VOICE_ID

router = APIRouter()


class TTSRequest(BaseModel):
    text: str
    voice_id: str | None = None


@router.get("/voices")
async def list_voices(_user: dict = Depends(current_user)):
    """Return the curated voice list from voices.py."""
    return VOICES


@router.post("/tts")
async def tts(body: TTSRequest, _user: dict = Depends(current_user)):
    try:
        audio = await tts_stream(body.text)
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    return Response(content=audio, media_type="audio/mpeg")


@router.post("/tts-timed")
async def tts_timed(body: TTSRequest, _user: dict = Depends(current_user)):
    try:
        return await tts_with_timestamps(body.text, voice_id=body.voice_id or DEFAULT_VOICE_ID)
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@router.post("/stt")
async def stt(audio: UploadFile = File(...), _user: dict = Depends(current_user)):
    data = await audio.read()
    try:
        result = await stt_transcribe(data, audio.filename or "audio.webm")
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    text = result.get("text") or result.get("transcript") or ""
    # Return word-level timestamps from the ElevenLabs response.
    # Each word: {"text": str, "start": float, "end": float, "type": "word"|"spacing"}
    words = [
        {"text": w["text"], "start": w["start"], "end": w["end"]}
        for w in (result.get("words") or [])
        if w.get("type") == "word"
    ]
    return {"text": text, "word_timestamps": words}
