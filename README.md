# WINterview

Behavioral interview practice app. Speak your answer to a random (or chosen)
behavioral question, get AI feedback on structure, specificity, pacing,
relevance, and reflection — then optionally share anonymously for peer
feedback.

- **Backend**: FastAPI + Motor (async MongoDB)
- **Frontend**: React + Vite
- **Auth**: Google Sign-In (ID token → backend-issued JWT)
- **Voice**: ElevenLabs (TTS + STT)
- **Analysis**: Google Gemini
- **DB**: MongoDB Atlas

## 1. One-time setup

### 1a. MongoDB Atlas
See [`MONGO_ATLAS_SETUP.md`](./MONGO_ATLAS_SETUP.md). You'll end up with a
connection string that goes into `.env` as `MONGO_URI`.

### 1b. Google OAuth
1. Go to https://console.cloud.google.com/apis/credentials
2. Create an **OAuth 2.0 Client ID** → Web application.
3. **Authorized JavaScript origins**: `http://localhost:5173`
4. **Authorized redirect URIs**: leave empty (we use the Google Identity
   Services JS library, which doesn't need one for the ID-token flow).
5. Copy the **Client ID** into `.env` for both `GOOGLE_CLIENT_ID` and
   `VITE_GOOGLE_CLIENT_ID`.

### 1c. API keys
- `ELEVENLABS_API_KEY` — https://elevenlabs.io/app/settings/api-keys
- `GEMINI_API_KEY` — https://aistudio.google.com/app/apikey
- `JWT_SECRET` — generate with:
  ```sh
  python3 -c "import secrets; print(secrets.token_urlsafe(48))"
  ```

All of these live in **one `.env` at the repo root** (already created). The
frontend's `vite.config.js` points `envDir` at the repo root so both apps share
the same file.

## 2. Run the backend

```sh
cd backend
uv sync                                 # install deps
uv run python scripts/seed.py           # seed 50 questions (first time only)
uv run uvicorn app.main:app --reload    # http://localhost:8000
```

## 3. Run the frontend

```sh
cd frontend
npm install
npm run dev                             # http://localhost:5173
```

Open http://localhost:5173, sign in with Google, click **Start practice**.

## Quick start (Windows)

From the repo root, run one command to start both backend and frontend:

```powershell
.\start-local.ps1
```

This opens two PowerShell windows (backend and frontend).

Optional flags:

```powershell
.\start-local.ps1 -SkipInstall -SkipSeed
```

## Architecture

```
frontend (Vite/React)                 backend (FastAPI)
   |                                      |
   |-- POST /auth/google  ---------------->|  verify Google ID token, issue JWT
   |-- GET  /questions?q=... ------------->|
   |-- POST /sessions   ------------------>|  sample or fetch selected questions
   |                                      |
   |-- POST /voice/tts  {text} ----------->|--> ElevenLabs TTS   --> audio/mpeg
   |-- POST /voice/stt  (audio blob) ----->|--> ElevenLabs STT   --> text
   |-- POST /responses  {transcript} ----->|--> compute pacing + fillers locally
   |                                      |--> Gemini scores 5 metrics (JSON)
   |                                      |--> save to MongoDB
   |                                      |
   |-- GET  /responses/feed  ------------->|
   |-- POST /responses/{id}/public  ------>|
   |-- POST /responses/{id}/rate     ----->|  recomputes avg + count
   |-- POST /responses/{id}/react   ------>|  like / dislike with toggle
   |-- POST /responses/{id}/comments ----->|
```

## Scoring metrics

Each response is scored 0–5 on five **non-overlapping** dimensions:

| Metric                        | Isolates                                               |
| ----------------------------- | ------------------------------------------------------ |
| Structure (STAR)              | Did they follow Situation / Task / Action / Result?    |
| Specificity & Depth           | Concrete names, numbers, stakes vs vague generalities  |
| Delivery (Pacing & Fillers)   | WPM + filler-word density (from local analysis)        |
| Relevance to Question         | Did the answer actually address what was asked?        |
| Reflection & Self-Awareness   | Meta-cognition: what they learned / would do differently (distinct from STAR's "Result" which is the outcome itself) |

`overall` is the mean of the five. Pacing is computed locally — the 10-bucket
WPM timeline feeds the pacing graph on the results page.

## Project layout

```
WINterview/
├── .env                    # single source of truth for all env vars
├── backend/
│   ├── pyproject.toml      # uv-managed
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py       # pydantic-settings, reads ../.env
│   │   ├── db.py           # Motor client + index setup
│   │   ├── auth.py         # Google ID-token verify + JWT
│   │   ├── models.py
│   │   ├── routers/        # auth · users · questions · sessions · responses · voice
│   │   ├── services/
│   │   │   ├── gemini_svc.py      # pacing + Gemini rubric
│   │   │   └── elevenlabs_svc.py  # TTS + STT
│   │   └── data/questions.json    # 50 seed questions
│   └── scripts/seed.py
└── frontend/
    ├── package.json
    ├── vite.config.js      # envDir: .. (shares repo-root .env)
    └── src/
        ├── main.jsx · App.jsx · api.js · auth.jsx · theme.jsx · styles.css
        ├── components/   Navbar · Logo · ThemeToggle · ResponseCard · PacingGraph
        └── pages/        Home · Login · Search · QuestionDetail ·
                          SessionSetup · SessionRun · SessionResult ·
                          Profile · ResponseDetail
```

## Notes

- Responses default to **private**. Only the owner sees the full AI breakdown.
  Public responses show only the overall score to other users.
- Shared responses are **anonymous** — no user name, no karma attributed.
- **Karma** is earned only by *commenting* on other people's responses; it's
  the net sum of 👍/👎 on all your comments.
- If `GEMINI_API_KEY` is missing, evaluations fall back to a mock so the UI
  stays usable during dev. Pacing stats are always computed locally.
