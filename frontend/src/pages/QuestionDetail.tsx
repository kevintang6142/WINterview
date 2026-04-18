import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import ResponseCard from '../components/ResponseCard'
import { main, card, stack, row, tag, muted, btnPrimary } from '../lib/ui'
import { Question, ResponseItem } from '../types'

export default function QuestionDetail() {
  const { id } = useParams<{ id: string }>()
  const [q, setQ] = useState<Question | null>(null)
  const [responses, setResponses] = useState<ResponseItem[]>([])

  useEffect(() => {
    api.get(`/questions/${id}`).then(setQ)
    api.get(`/questions/${id}/responses`).then((rs: ResponseItem[]) =>
      setResponses(rs.map((r) => ({ ...r, question_text: '' }))))
  }, [id])

  if (!q) return <div className={main}><div className={card}>Loading…</div></div>

  return (
    <div className={main}>
      <div className={stack}>
        <div className={card}>
          <div className="font-semibold text-lg mb-2">{q.text}</div>
          <div className={row}>
            {q.tags?.map((t) => <span key={t} className={tag}>{t}</span>)}
          </div>
        </div>
        <div>
          <Link to="/practice" state={{ preselect: id }} className={btnPrimary}>
            Answer this question
          </Link>
        </div>
        <h3 className="mx-1 my-2">Public responses</h3>
        {responses.length === 0 && <div className={`${card} ${muted}`}>No public responses yet.</div>}
        {responses.map((r) => <ResponseCard key={r.id} item={{ ...r, question_text: q.text }} />)}
      </div>
    </div>
  )
}
