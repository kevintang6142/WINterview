import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useSettings } from '../settings'

/**
 * Session flow:
 *  - When a question loads: auto-play TTS once, with word-by-word highlighting.
 *  - When TTS finishes: auto-start recording (unless the setting is off).
 *  - When user stops recording: kick off a background promise
 *      (STT → submit → Gemini evaluate) and immediately advance to
 *      the next question (unless the setting is off).
 *  - After the last question: show a loading screen while we
 *    await every in-flight evaluation, then navigate to the results page.
 */
export default function SessionRun() {
  const { id } = useParams()
  const nav = useNavigate()
  const { settings } = useSettings()

  const [session, setSession] = useState(null)
  const [qIndex, setQIndex] = useState(0)
  const [phase, setPhase] = useState('loading')
  // phase: loading | playing | idle | recording | transcribing | evaluating | saved | countdown | waiting-all
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState(null)
  const [highlightIndex, setHighlightIndex] = useState(-1) // which word is currently spoken
  const [alignment, setAlignment] = useState(null) // {words, segments} from /voice/tts-timed
  const rafRef = useRef(null)
  const [finalizing, setFinalizing] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const countdownTimerRef = useRef(null)
  const [recordElapsed, setRecordElapsed] = useState(0)
  const recordTickerRef = useRef(null)
  const recordAutoStopRef = useRef(null)

  const pendingEvalsRef = useRef([]) // Array<Promise<{id, evaluation, ...}>>
  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const startedAtRef = useRef(0)
  const audioRef = useRef(null)
  const hasPlayedRef = useRef({}) // qIndex -> played once

  // Load session
  useEffect(() => {
    const cached = sessionStorage.getItem(`session:${id}`)
    if (cached) {
      setSession(JSON.parse(cached))
      setPhase('idle')
    } else {
      setError('Session not found in this tab. Start a new one.')
    }
  }, [id])

  const current = session?.questions?.[qIndex]
  const isLast = session && qIndex === session.questions.length - 1

  // Auto-play TTS once when a new question appears
  useEffect(() => {
    if (!current) return
    if (hasPlayedRef.current[qIndex]) return
    hasPlayedRef.current[qIndex] = true
    playQuestion()

  }, [qIndex, session])

  const playQuestion = async () => {
    if (!current) return
    setHighlightIndex(-1)
    setAlignment(null)
    setPhase('playing')

    try {
      const resp = await api.post('/voice/tts-timed', { text: current.text })
      const { audio_base64, words, segments } = resp
      const ws = words || []
      setAlignment({ words: ws, segments: segments || [] })

      const audioUrl = `data:audio/mpeg;base64,${audio_base64}`
      const audio = new Audio(audioUrl)
      audioRef.current = audio

      // rAF-based tick: keeps highlight in sync at display rate instead of
      // ontimeupdate's ~250ms cadence.
      let lastIdx = -1
      const tick = () => {
        if (!audioRef.current) return
        const t = audio.currentTime
        let idx = -1
        for (let i = 0; i < ws.length; i++) {
          if (t < ws[i].start) break
          if (t <= ws[i].end) { idx = i; break }
          idx = i  // past this word, keep updating in case we're in a gap
        }
        if (idx !== lastIdx) {
          lastIdx = idx
          setHighlightIndex(idx)
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      audio.onplay = () => {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(tick)
      }
      audio.onpause = () => {
        cancelAnimationFrame(rafRef.current)
      }
      audio.onended = () => {
        cancelAnimationFrame(rafRef.current)
        setHighlightIndex(-1)
        audioRef.current = null
        onTTSFinished()
      }
      audio.onerror = () => {
        cancelAnimationFrame(rafRef.current)
        audioRef.current = null
        setPhase('idle')
      }
      await audio.play()
    } catch (e) {
      // TTS failed (no API key, network, etc.) — fall through so user can still answer.
      setPhase('idle')
      setError(`Couldn't read question aloud: ${e.message}`)
      onTTSFinished()
    }
  }

  const onTTSFinished = () => {
    setPhase('idle')
    if (settings.autoRecord) {
      // small delay so the user doesn't start talking over the very last syllable
      setTimeout(() => startRecording(), 250)
    }
  }

  const startRecording = async () => {
    setError(null)
    setTranscript('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const rec = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const duration = (Date.now() - startedAtRef.current) / 1000
        const blob = new Blob(chunksRef.current, { type: mime })
        handleRecordingComplete(blob, duration)
      }
      mediaRef.current = rec
      startedAtRef.current = Date.now()
      rec.start()
      setPhase('recording')

      // Live elapsed timer + hard cap.
      setRecordElapsed(0)
      if (recordTickerRef.current) clearInterval(recordTickerRef.current)
      recordTickerRef.current = setInterval(() => {
        setRecordElapsed((Date.now() - startedAtRef.current) / 1000)
      }, 200)
      const capMs = Math.max(10, Number(settings.maxResponseSeconds) || 180) * 1000
      if (recordAutoStopRef.current) clearTimeout(recordAutoStopRef.current)
      recordAutoStopRef.current = setTimeout(() => {
        if (mediaRef.current && mediaRef.current.state !== 'inactive') {
          mediaRef.current.stop()
        }
      }, capMs)
    } catch (e) {
      setError(`Microphone error: ${e.message}`)
      setPhase('idle')
    }
  }

  const stopRecording = () => {
    if (mediaRef.current && mediaRef.current.state !== 'inactive') {
      mediaRef.current.stop()
    }
    if (recordTickerRef.current) { clearInterval(recordTickerRef.current); recordTickerRef.current = null }
    if (recordAutoStopRef.current) { clearTimeout(recordAutoStopRef.current); recordAutoStopRef.current = null }
  }

  // Called once the MediaRecorder has a finalized blob.
  const handleRecordingComplete = (blob, duration) => {
    // Kick off STT + submit in the background. Do NOT await here.
    const q = current
    const evalPromise = (async () => {
      const fd = new FormData()
      fd.append('audio', blob, 'answer.webm')
      const { text } = await api.postForm('/voice/stt', fd)
      const saved = await api.post('/responses', {
        session_id: id,
        question_id: q.id,
        transcript: text,
        duration_seconds: duration,
      })
      return {
        id: saved.id,
        evaluation: saved.evaluation,
        transcript: text,
        duration_seconds: duration,
        question_id: q.id,
        question_text: q.text,
      }
    })()
    evalPromise.catch(() => {}) // swallow so unhandled rejection doesn't bubble
    pendingEvalsRef.current.push(evalPromise)

    if (settings.autoAdvance) {
      if (isLast) {
        finishSession()
      } else {
        beginCountdown()
      }
    } else {
      // Manual mode: stay on this question, show transcript when it arrives.
      setPhase('transcribing')
      evalPromise
        .then((r) => {
          setTranscript(r.transcript)
          setPhase('saved')
        })
        .catch((e) => {
          setError(`Failed: ${e.message}`)
          setPhase('idle')
        })
    }
  }

  const beginCountdown = () => {
    const secs = Math.max(0, Number(settings.autoAdvanceSeconds) || 0)
    if (secs === 0) {
      setQIndex((i) => i + 1)
      setPhase('idle')
      return
    }
    setCountdown(secs)
    setPhase('countdown')
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    countdownTimerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(countdownTimerRef.current)
          countdownTimerRef.current = null
          setQIndex((i) => i + 1)
          setPhase('idle')
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (recordTickerRef.current) clearInterval(recordTickerRef.current)
      if (recordAutoStopRef.current) clearTimeout(recordAutoStopRef.current)
    }
  }, [])

  const fmtClock = (secs) => {
    const s = Math.max(0, Math.floor(secs))
    const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
  }

  const manualNext = () => {
    if (isLast) {
      finishSession()
    } else {
      setQIndex((i) => i + 1)
      setTranscript('')
      setPhase('idle')
    }
  }

  const finishSession = async () => {
    setFinalizing(true)
    setPhase('waiting-all')
    try {
      const results = await Promise.allSettled(pendingEvalsRef.current)
      const ok = results
        .filter((r) => r.status === 'fulfilled')
        .map((r) => r.value)
      await api.post(`/sessions/${id}/complete`).catch(() => {})
      sessionStorage.setItem(`session-results:${id}`, JSON.stringify(ok))
      nav(`/session/${id}/result`)
    } catch (e) {
      setError(`Could not finalize session: ${e.message}`)
      setFinalizing(false)
      setPhase('idle')
    }
  }

  const skipText = async () => {
    const typed = prompt('Type your answer:', transcript || '')
    if (!typed || !typed.trim()) return
    const q = current
    const duration = Math.max(1, (typed.split(/\s+/).length / 150) * 60)
    const evalPromise = api
      .post('/responses', {
        session_id: id,
        question_id: q.id,
        transcript: typed,
        duration_seconds: duration,
      })
      .then((saved) => ({
        id: saved.id,
        evaluation: saved.evaluation,
        transcript: typed,
        duration_seconds: duration,
        question_id: q.id,
        question_text: q.text,
      }))
    evalPromise.catch(() => {})
    pendingEvalsRef.current.push(evalPromise)

    if (settings.autoAdvance) {
      if (isLast) finishSession()
      else beginCountdown()
    } else {
      setTranscript(typed)
      setPhase('saved')
    }
  }

  // Render the question text with per-word highlighting during TTS.
  // Uses the authoritative `segments` from the backend (every character of
  // the original text is present, with word_index set on word segments) so
  // punctuation-inside-words can't cause drift.
  const questionNode = useMemo(() => {
    if (!current) return null
    const segs = alignment?.segments
    if (!segs || segs.length === 0 || phase !== 'playing') {
      return <span>{current.text}</span>
    }
    return segs.map((seg, i) => {
      if (seg.word_index === -1) return <span key={i}>{seg.text}</span>
      const active = seg.word_index === highlightIndex
      return (
        <span
          key={i}
          className={active ? 'tts-active' : 'tts-word'}
        >
          {seg.text}
        </span>
      )
    })
  }, [current, alignment, highlightIndex, phase])

  if (error && !session) {
    return <div className="main"><div className="card">{error}</div></div>
  }
  if (!session) {
    return <div className="main"><div className="card">Loading session…</div></div>
  }

  if (phase === 'countdown') {
    return (
      <div className="main">
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div className="muted">Next question in</div>
          <div style={{ fontSize: 72, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>
            {countdown}
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'waiting-all') {
    return (
      <div className="main">
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div className="spinner" aria-label="Loading" />
          <h3 style={{ margin: '20px 0 6px' }}>Processing your answers…</h3>
          <div className="muted">
            Transcribing audio and scoring with Gemini. Don't close this tab.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="main">
      <div className="stack">
        <div className="card">
          <div className="muted">
            Question {qIndex + 1} of {session.questions.length}
          </div>
          <div className="session-prompt">{questionNode}</div>

          <div className="row" style={{ gap: 10, marginBottom: 12 }}>
            <button className="ghost small" onClick={skipText}>Type instead</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '24px 0', gap: 8 }}>
            {phase === 'recording' ? (
              <>
                <button className="mic-btn recording" onClick={stopRecording}>
                  ⏹ Stop
                </button>
                <div className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtClock(recordElapsed)} / {fmtClock(settings.maxResponseSeconds)}
                </div>
              </>
            ) : phase === 'idle' || phase === 'saved' ? (
              <button
                className="mic-btn"
                onClick={startRecording}
                disabled={phase === 'saved' && !settings.autoAdvance}
              >
                🎤 Record
              </button>
            ) : (
              <button className="mic-btn" disabled>
                {phase === 'playing' ? '🔊 Reading…' : '…'}
              </button>
            )}
          </div>


          {phase === 'transcribing' && <div className="muted">Transcribing…</div>}

          {error && (
            <div className="card" style={{ background: 'var(--surface-2)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          {transcript && !settings.autoAdvance && (
            <div className="card" style={{ marginTop: 14, background: 'var(--surface-2)' }}>
              <strong>Your transcript</strong>
              <p style={{ whiteSpace: 'pre-wrap' }}>{transcript}</p>
            </div>
          )}

          {!settings.autoAdvance && phase === 'saved' && (
            <div style={{ marginTop: 16 }}>
              <button onClick={manualNext}>
                {isLast ? 'Finish & see results' : 'Next question →'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
