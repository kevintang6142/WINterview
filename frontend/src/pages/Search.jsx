import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

export default function Search() {
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchQs = (query) => {
    setLoading(true)
    const url = query ? `/questions?q=${encodeURIComponent(query)}` : '/questions'
    api.get(url)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchQs('') }, [])

  return (
    <div className="main">
      <div className="stack">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Search behavioral questions</h3>
          <form
            className="row"
            onSubmit={(e) => { e.preventDefault(); fetchQs(q) }}
          >
            <input
              placeholder="keywords: leadership, conflict, failure, deadline…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button type="submit">Search</button>
          </form>
        </div>

        {loading && <div className="card muted">Loading…</div>}
        {!loading && items.length === 0 && (
          <div className="card muted">No questions found.</div>
        )}
        {items.map((it) => (
          <Link
            to={`/question/${it.id}`}
            key={it.id}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div className="card feed-item">
              <div className="q">{it.text}</div>
              <div className="row" style={{ marginTop: 8 }}>
                {it.tags?.map((t) => <span key={t} className="tag">{t}</span>)}
                <span className="muted" style={{ marginLeft: 'auto' }}>
                  {it.response_count} response{it.response_count === 1 ? '' : 's'}
                  {it.avg_rating != null ? ` · ⭐ ${it.avg_rating.toFixed(1)}` : ''}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
