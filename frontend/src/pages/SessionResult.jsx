import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import PacingGraph from '../components/PacingGraph'

const METRICS = [
  ['structure_star', 'Structure (STAR)'],
  ['specificity_depth', 'Specificity & Depth'],
  ['delivery_pacing', 'Delivery (Pacing & Fillers)'],
  ['relevance', 'Relevance to Question'],
  ['reflection', 'Reflection & Self-Awareness'],
]

function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0))
  const m = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return `${m}:${ss}`
}

function MetricRow({ name, data }) {
  if (!data) return null
  return (
    <div className="metric">
      <div>
        <div className="metric-name">{name}</div>
        <div className="metric-fb">{data.feedback}</div>
      </div>
      <div className="metric-score">{data.score?.toFixed?.(1) ?? '—'}/5</div>
    </div>
  )
}

export default function SessionResult() {
  const { id } = useParams()
  const [items, setItems] = useState([])

  useEffect(() => {
    const cached = sessionStorage.getItem(`session-results:${id}`)
    if (cached) setItems(JSON.parse(cached))
  }, [id])

  const togglePublic = async (responseId, current) => {
    await api.post(`/responses/${responseId}/public`, { is_public: !current })
    setItems((arr) =>
      arr.map((r) => (r.id === responseId ? { ...r, is_public: !current } : r)),
    )
  }

  if (items.length === 0) {
    return (
      <div className="main">
        <div className="card">
          No results for this session in this tab.{' '}
          <Link to="/profile">View your responses on your profile.</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="main">
      <div className="stack">
        <div className="card banner">
          This breakdown is <strong>private to you</strong>. Public shares only
          include your transcript and pacing data — never the AI scores or
          feedback.
        </div>

        {items.map((r) => {
          const ev = r.evaluation || {}
          const fillerEntries = ev.filler_words
            ? Object.entries(ev.filler_words)
            : []
          return (
            <div key={r.id} className="card">
              <div className="big-question">{r.question_text}</div>

              <div className="spread">
                <div className="muted">
                  Time taken: <strong>{fmtDuration(r.duration_seconds || ev.duration_seconds)}</strong>
                  {' · '}
                  Words: <strong>{ev.word_count ?? 0}</strong>
                </div>
                {ev.overall != null && (
                  <span className="score-pill">
                    Overall {ev.overall.toFixed?.(1) ?? ev.overall}/5
                  </span>
                )}
              </div>

              <div className="card" style={{ background: 'var(--surface-2)', marginTop: 14 }}>
                <strong>Your response</strong>
                <p style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>
                  {r.transcript}
                </p>
              </div>

              <div style={{ marginTop: 18 }}>
                <div className="muted" style={{ marginBottom: 6 }}>
                  Average pacing: <strong>{ev.words_per_minute ?? 0} WPM</strong>
                </div>
                <PacingGraph
                  timeline={ev.pacing_timeline || []}
                  durationSeconds={ev.duration_seconds || r.duration_seconds || 0}
                />
                <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  <strong>{ev.filler_count ?? 0} filler words</strong>
                  {fillerEntries.map(([w, n]) => (
                    <span key={w} className="tag">{w}: {n}</span>
                  ))}
                </div>
              </div>

              {ev.structure_star && (
                <div style={{ marginTop: 18 }}>
                  {METRICS.map(([k, label]) => (
                    <MetricRow key={k} name={label} data={ev[k]} />
                  ))}
                </div>
              )}

              {(ev.strengths?.length || ev.improvements?.length) > 0 && (
                <div style={{ marginTop: 14 }}>
                  {ev.strengths?.length > 0 && (
                    <>
                      <strong>Strengths</strong>
                      <ul>{ev.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    </>
                  )}
                  {ev.improvements?.length > 0 && (
                    <>
                      <strong>Improvements</strong>
                      <ul>{ev.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    </>
                  )}
                </div>
              )}

              {ev.summary && (
                <div className="card banner" style={{ marginTop: 14 }}>{ev.summary}</div>
              )}

              <div style={{ marginTop: 14 }} className="row">
                <button
                  className={r.is_public ? 'danger' : ''}
                  onClick={() => togglePublic(r.id, r.is_public)}
                >
                  {r.is_public ? 'Make private' : 'Share publicly (anonymous)'}
                </button>
                <Link to={`/response/${r.id}`} className="btn ghost">
                  View shareable page
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
