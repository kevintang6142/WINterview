import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
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

function Stars({ value, onChange, readonly }) {
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`star ${value >= n ? 'on' : ''}`}
          onClick={() => !readonly && onChange?.(n)}
        >
          ★
        </span>
      ))}
    </div>
  )
}

export default function ResponseDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [comments, setComments] = useState([])
  const [draft, setDraft] = useState('')

  const load = () => {
    api.get(`/responses/${id}`).then(setData).catch(() => setData(null))
    api.get(`/responses/${id}/comments`).then(setComments).catch(() => setComments([]))
  }
  useEffect(load, [id])

  const react = async (value) => {
    if (!user) return alert('Sign in to react')
    const r = await api.post(`/responses/${id}/react`, {
      value: data.my_reaction === value ? 0 : value,
    })
    setData((d) => ({
      ...d,
      like_count: r.like_count,
      dislike_count: r.dislike_count,
      my_reaction: d.my_reaction === value ? null : value,
    }))
  }

  const rate = async (stars) => {
    if (!user) return alert('Sign in to rate')
    const r = await api.post(`/responses/${id}/rate`, { stars })
    setData((d) => ({
      ...d,
      avg_rating: r.avg_rating,
      rating_count: r.rating_count,
      my_rating: stars,
    }))
  }

  const addComment = async (e) => {
    e.preventDefault()
    if (!draft.trim()) return
    await api.post(`/responses/${id}/comments`, { body: draft.trim() })
    setDraft('')
    load()
  }

  if (!data) return <div className="main"><div className="card">Loading…</div></div>

  const ev = data.evaluation || {}
  const isOwner = data.is_owner
  const fillerEntries = ev.filler_words ? Object.entries(ev.filler_words) : []

  return (
    <div className="main">
      <div className="stack">
        <div className="card">
          <div className="big-question">{data.question_text}</div>

          <div className="muted">
            {data.is_public ? 'Public · anonymous' : 'Private (only you can see this)'}
            {' · '}Time taken: <strong>{fmtDuration(data.duration_seconds || ev.duration_seconds)}</strong>
            {ev.word_count != null && <> · Words: <strong>{ev.word_count}</strong></>}
          </div>

          <div className="card" style={{ background: 'var(--surface-2)', marginTop: 14 }}>
            <strong>Response</strong>
            <p style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{data.transcript}</p>
          </div>

          {ev.pacing_timeline && ev.pacing_timeline.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="muted" style={{ marginBottom: 6 }}>
                Average pacing: <strong>{ev.words_per_minute ?? 0} WPM</strong>
              </div>
              <PacingGraph
                timeline={ev.pacing_timeline}
                durationSeconds={ev.duration_seconds || data.duration_seconds || 0}
              />
              <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <strong>{ev.filler_count ?? 0} filler words</strong>
                {fillerEntries.map(([w, n]) => (
                  <span key={w} className="tag">{w}: {n}</span>
                ))}
              </div>
            </div>
          )}

          {isOwner && ev.structure_star && (
            <div style={{ marginTop: 18 }}>
              <h3 style={{ marginBottom: 4 }}>AI feedback <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>(only you can see this)</span></h3>
              {METRICS.map(([k, label]) => ev[k] && (
                <div className="metric" key={k}>
                  <div>
                    <div className="metric-name">{label}</div>
                    <div className="metric-fb">{ev[k].feedback}</div>
                  </div>
                  <div className="metric-score">{ev[k].score.toFixed(1)}/5</div>
                </div>
              ))}
              {ev.overall != null && (
                <div className="muted" style={{ marginTop: 10 }}>
                  Overall: <strong>{ev.overall.toFixed?.(1) ?? ev.overall}/5</strong>
                </div>
              )}
            </div>
          )}
        </div>

        {data.is_public && (
          <div className="card">
            <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
              <button
                className={data.my_reaction === 1 ? '' : 'ghost'}
                onClick={() => react(1)}
              >
                👍 {data.like_count}
              </button>
              <button
                className={data.my_reaction === -1 ? '' : 'ghost'}
                onClick={() => react(-1)}
              >
                👎 {data.dislike_count}
              </button>
              <div className="row" style={{ gap: 8 }}>
                <span className="muted">Your rating:</span>
                <Stars
                  value={data.my_rating || 0}
                  onChange={rate}
                  readonly={isOwner}
                />
                <span className="muted">
                  avg {data.avg_rating != null ? data.avg_rating.toFixed(1) : '—'}
                  {data.rating_count ? ` · ${data.rating_count} rating${data.rating_count === 1 ? '' : 's'}` : ''}
                </span>
              </div>
            </div>
          </div>
        )}

        {data.is_public && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Comments ({comments.length})</h3>
            {user ? (
              <form onSubmit={addComment}>
                <textarea
                  placeholder="Leave constructive feedback…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div style={{ marginTop: 8 }}>
                  <button disabled={!draft.trim()}>Post comment</button>
                </div>
              </form>
            ) : (
              <div className="muted">Sign in to comment.</div>
            )}

            <div className="stack" style={{ marginTop: 14 }}>
              {comments.map((c) => (
                <div key={c.id} className="card" style={{ background: 'var(--surface-2)' }}>
                  <div className="row">
                    {c.user_picture && <img className="thumb" src={c.user_picture} alt="" />}
                    <strong>{c.user_name}</strong>
                    <span className="muted" style={{ marginLeft: 'auto' }}>
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p style={{ marginTop: 8 }}>{c.body}</p>
                  <CommentReactions
                    commentId={c.id}
                    initialLike={c.like_count}
                    initialDislike={c.dislike_count}
                    initialMine={c.my_reaction}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CommentReactions({ commentId, initialLike = 0, initialDislike = 0, initialMine = 0 }) {
  const { user } = useAuth()
  const [counts, setCounts] = useState({
    like: initialLike,
    dislike: initialDislike,
    mine: initialMine,
  })
  const send = async (value) => {
    if (!user) return alert('Sign in to react')
    const r = await api.post(`/responses/comments/${commentId}/react`, {
      value: counts.mine === value ? 0 : value,
    })
    setCounts((c) => ({
      like: r.like_count,
      dislike: r.dislike_count,
      mine: c.mine === value ? 0 : value,
    }))
  }
  return (
    <div className="row" style={{ gap: 10, marginTop: 6 }}>
      <button
        className={counts.mine === 1 ? 'small' : 'small ghost'}
        onClick={() => send(1)}
      >
        👍 {counts.like}
      </button>
      <button
        className={counts.mine === -1 ? 'small' : 'small ghost'}
        onClick={() => send(-1)}
      >
        👎 {counts.dislike}
      </button>
    </div>
  )
}
