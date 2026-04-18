import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import ResponseCard from '../components/ResponseCard'

export default function QuestionDetail() {
  const { id } = useParams()
  const [q, setQ] = useState(null)
  const [responses, setResponses] = useState([])

  useEffect(() => {
    api.get(`/questions/${id}`).then(setQ)
    api.get(`/questions/${id}/responses`).then((rs) =>
      setResponses(rs.map((r) => ({ ...r, question_text: '' })))
    )
  }, [id])

  if (!q) return <div className="main"><div className="card">Loading…</div></div>

  return (
    <div className="main">
      <div className="stack">
        <div className="card">
          <div className="q" style={{ fontSize: 18, marginBottom: 8 }}>{q.text}</div>
          <div className="row">
            {q.tags?.map((t) => <span key={t} className="tag">{t}</span>)}
          </div>
          <div style={{ marginTop: 14 }}>
            <Link to="/practice" state={{ preselect: id }} className="btn">
              Answer this question
            </Link>
          </div>
        </div>
        <h3 style={{ margin: '8px 4px' }}>Public responses</h3>
        {responses.length === 0 && (
          <div className="card muted">No public responses yet.</div>
        )}
        {responses.map((r) => (
          <ResponseCard key={r.id} item={{ ...r, question_text: q.text }} />
        ))}
      </div>
    </div>
  )
}
