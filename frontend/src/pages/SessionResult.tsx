import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import PacingGraph from '../components/PacingGraph'
import { main, card, stack, spread, row, muted, tag, banner, bigQuestion, scorePill, metricRow, metricName, metricFb, metricScore, btnPrimary, btnDanger, btnGhost } from '../lib/ui'
import { Evaluation, MetricData } from '../types'

const METRICS: [keyof Evaluation, string][] = [
  ['structure_star', 'Structure (STAR)'],
  ['specificity_depth', 'Specificity & Depth'],
  ['delivery_pacing', 'Delivery (Pacing & Fillers)'],
  ['relevance', 'Relevance to Question'],
  ['reflection', 'Reflection & Self-Awareness'],
]

function fmtDuration(seconds?: number) {
  if (!seconds || seconds <= 0) return 'Text response'
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

interface ResultItem {
  id: string; question_text: string; transcript: string
  duration_seconds?: number; is_public?: boolean; evaluation?: Evaluation
}

export default function SessionResult() {
  const { id } = useParams<{ id: string }>()
  const [items, setItems] = useState<ResultItem[]>([])

  useEffect(() => {
    const cached = sessionStorage.getItem(`session-results:${id}`)
    if (cached) setItems(JSON.parse(cached))
  }, [id])

  const togglePublic = async (responseId: string, current?: boolean) => {
    await api.post(`/responses/${responseId}/public`, { is_public: !current })
    setItems((arr) => arr.map((r) => r.id === responseId ? { ...r, is_public: !current } : r))
  }

  if (items.length === 0) return (
    <div className={main}>
      <div className={card}>
        No results for this session in this tab.{' '}
        <Link to="/profile">View your responses on your profile.</Link>
      </div>
    </div>
  )

  return (
    <div className={main}>
      <div className={stack}>
        <div className={banner}>
          This breakdown is <strong>private to you</strong>. Public shares only include your
          transcript and pacing data — never the AI scores or feedback.
        </div>

        {items.map((r) => {
          const ev = r.evaluation || {}
          const fillerEntries = ev.filler_words ? Object.entries(ev.filler_words) : []
          return (
            <div key={r.id} className={card}>
              <div className={bigQuestion}>{r.question_text}</div>

              <div className={spread}>
                <div className={muted}>
                  Time taken: <strong>{fmtDuration(r.duration_seconds || ev.duration_seconds)}</strong>
                  {' · '}Words: <strong>{ev.word_count ?? 0}</strong>
                </div>
                {ev.overall != null && (
                  <span className={scorePill}>Overall {ev.overall.toFixed?.(1) ?? ev.overall}/5</span>
                )}
              </div>

              <div className={`${card} bg-skin-surface-2 mt-3.5`}>
                <strong>Your response</strong>
                <p className="whitespace-pre-wrap mt-1.5">{r.transcript}</p>
              </div>

              <div className="mt-4">
                <div className={`${muted} mb-1.5`}>Average pacing: <strong>{ev.words_per_minute ?? 0} WPM</strong></div>
                <PacingGraph timeline={ev.pacing_timeline || []} durationSeconds={ev.duration_seconds || r.duration_seconds || 0} />
                <div className={`${row} flex-wrap gap-2 mt-2.5`}>
                  <strong>{ev.filler_count ?? 0} filler words</strong>
                  {fillerEntries.map(([w, n]) => <span key={w} className={tag}>{w}: {n}</span>)}
                </div>
              </div>

              {ev.structure_star && (
                <div className="mt-4">
                  {METRICS.map(([k, label]) => (
                    <div key={k} className={metricRow}>
                      <div><div className={metricName}>{label}</div><div className={metricFb}>{(ev[k] as MetricData)?.feedback}</div></div>
                      <div className={metricScore}>{(ev[k] as MetricData)?.score?.toFixed?.(1) ?? '—'}/5</div>
                    </div>
                  ))}
                </div>
              )}

              {((ev.strengths?.length ?? 0) > 0 || (ev.improvements?.length ?? 0) > 0) && (
                <div className="mt-3.5">
                  {(ev.strengths?.length ?? 0) > 0 && (<><strong>Strengths</strong><ul>{ev.strengths!.map((s, i) => <li key={i}>{s}</li>)}</ul></>)}
                  {(ev.improvements?.length ?? 0) > 0 && (<><strong>Improvements</strong><ul>{ev.improvements!.map((s, i) => <li key={i}>{s}</li>)}</ul></>)}
                </div>
              )}

              {ev.summary && <div className={`${banner} mt-3.5`}>{ev.summary}</div>}

              <div className={`${row} mt-3.5`}>
                <button className={r.is_public ? btnDanger : btnPrimary} onClick={() => togglePublic(r.id, r.is_public)}>
                  {r.is_public ? 'Make private' : 'Share publicly (anonymous)'}
                </button>
                <Link to={`/response/${r.id}`} className={btnGhost}>View shareable page</Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
