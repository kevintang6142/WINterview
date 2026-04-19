"""
Known ElevenLabs voices available in this app.
Add more entries here as needed — the frontend voice picker is populated from this list.

Each entry:
  id:       ElevenLabs voice_id
  name:     Display name shown in the dropdown
  category: Optional grouping label (e.g. "premade", "cloned")
"""
from __future__ import annotations

VOICES: list[dict] = [
    {
        "id": "21m00Tcm4TlvDq8ikWAM",
        "name": "Rachel",
        "category": "premade",
    },
    {
        "id": "DODLEQrClDo8wCz460ld",
        "name": "Lauren",
        "category": "premade",
    },
    {
        "id": "sB7vwSCyX0tQmU24cW2C",
        "name": "Jon",
        "category": "premade",
    },
]

# ID of the voice to use when none is specified
DEFAULT_VOICE_ID: str = VOICES[0]["id"]
