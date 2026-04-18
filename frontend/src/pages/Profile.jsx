import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'

export default function Profile() {
  const { user } = useAuth()
  const [items, setItems] = useState([])

  useEffect(() => {
    api.get('/users/me/responses').then(setItems).catch(() => setItems([]))
  }, [])

  const togglePublic = async (id, current) => {
    await api.post(`/responses/${id}/public`, { is_public: !current })
    setItems((arr) => arr.map((r) => (r.id === id ? { ...r, is_public: !current } : r)))
  }

  return (
    <div className="main with-sidebar">
      <div className="stack">
        <h3 style={{ margin: 0 }}>My responses</h3>
        {items.length === 0 && (
          <div className="card muted">
            No responses yet. <Link to="/practice">Start practicing →</Link>
          </div>
        )}
        {items.map((r) => (
          <div key={r.id} className="card">
            <div className="spread">
              <Link to={`/response/${r.id}`} style={{ color: 'inherit' }}>
                <div className="q">{r.question_text}</div>
              </Link>
              {r.overall_score != null && (
                <span className="score-pill">{r.overall_score.toFixed(1)}/5</span>
              )}
            </div>
            <div className="preview muted">{r.transcript_preview}…</div>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="tag">{r.is_public ? 'Public' : 'Private'}</span>
              {r.is_public && (
                <span className="muted">
                  ⭐ {r.avg_rating != null ? r.avg_rating.toFixed(1) : '—'}
                  {r.rating_count ? ` (${r.rating_count})` : ''} · 👍 {r.like_count || 0}
                </span>
              )}
              <button
                className="ghost small"
                style={{ marginLeft: 'auto' }}
                onClick={() => togglePublic(r.id, r.is_public)}
              >
                {r.is_public ? 'Make private' : 'Share publicly'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <aside className="sidebar">
        <div style={{ textAlign: 'center' }}>
          {user?.picture && (
            <img
              src={user.picture}
              alt=""
              style={{ width: 72, height: 72, borderRadius: '50%' }}
            />
          )}
          <h3>{user?.name}</h3>
          <div className="muted">{user?.email}</div>
          <div style={{ marginTop: 12 }}>
            <span className="score-pill">Karma {user?.karma ?? 0}</span>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
            Karma is earned when the community upvotes your comments on other
            people's responses. Shared responses themselves are anonymous and
            earn no karma.
          </p>
        </div>
      </aside>
    </div>
  )
}
