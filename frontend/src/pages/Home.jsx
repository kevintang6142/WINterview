import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import ResponseCard from '../components/ResponseCard'
import { useAuth } from '../auth'

export default function Home() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [sort, setSort] = useState('new')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/responses/feed?sort=${sort}`)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [sort])

  return (
    <div className="main with-sidebar">
      <div className="stack">
        <div className="card spread">
          <div className="row" style={{ gap: 8 }}>
            <button
              className={sort === 'new' ? '' : 'ghost'}
              onClick={() => setSort('new')}
            >
              New
            </button>
            <button
              className={sort === 'top' ? '' : 'ghost'}
              onClick={() => setSort('top')}
            >
              Top
            </button>
          </div>
          {user ? (
            <Link to="/practice" className="btn">Start practice</Link>
          ) : (
            <Link to="/login" className="btn">Sign in to practice</Link>
          )}
        </div>

        {loading && <div className="card muted">Loading feed…</div>}
        {!loading && items.length === 0 && (
          <div className="card muted">
            No public responses yet. Be the first — start a practice session and
            toggle your response to public from the results page.
          </div>
        )}
        {items.map((item) => (
          <ResponseCard key={item.id} item={item} />
        ))}
      </div>

      <aside className="sidebar">
        <h3 style={{ marginTop: 0 }}>About</h3>
        <p className="muted">
          WINterview is a behavioral interview practice app. Practice speaking
          your answers to random questions, get AI feedback on structure,
          specificity, pacing, relevance, and reflection, then optionally share
          your response for peer feedback.
        </p>
        <h3>Search</h3>
        <p className="muted">
          Browse questions by keyword to see community responses.
        </p>
        <Link to="/search" className="btn ghost" style={{ display: 'inline-block' }}>
          Browse questions
        </Link>
      </aside>
    </div>
  )
}
