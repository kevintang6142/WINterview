import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { useMastery } from '../mastery'
import MasteryDropdown from '../components/MasteryDropdown'
import { mainSidebar, sidebar, card, stack, row, muted, tag, scorePill, btnSmGhost, btnDanger } from '../lib/ui'
import { ResponseItem, Question } from '../types'

function MasteryPie({ mastered, inProgress, total }: { mastered: number; inProgress: number; total: number }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const pctMastered = total > 0 ? mastered / total : 0
  const pctInProgress = total > 0 ? inProgress / total : 0
  const dashMastered = circ * pctMastered
  const dashInProgress = circ * pctInProgress
  const notStarted = total - mastered - inProgress
  return (
    <div className="flex flex-col items-center mt-7 mb-4">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--border)" strokeWidth="11" />
        {pctInProgress > 0 && (
          <circle
            cx="48" cy="48" r={r} fill="none"
            stroke="#f59e0b" strokeWidth="11"
            strokeDasharray={`${dashInProgress} ${circ - dashInProgress}`}
            transform="rotate(-90 48 48)"
          />
        )}
        {pctMastered > 0 && (
          <circle
            cx="48" cy="48" r={r} fill="none"
            stroke="var(--success)" strokeWidth="11"
            strokeDasharray={`${dashMastered} ${circ - dashMastered}`}
            transform={`rotate(${-90 + pctInProgress * 360} 48 48)`}
          />
        )}
        <text x="48" y="46" textAnchor="middle" fontSize="13" fontWeight="bold" fill="var(--text)">
          {mastered}/{total}
        </text>
        <text x="48" y="58" textAnchor="middle" fontSize="9" fill="var(--text-muted)">mastered</text>
      </svg>
      <div className="text-xs mt-1 text-skin-muted">{notStarted} not started</div>
      <div className="text-amber-600 dark:text-amber-400 text-xs mt-0.5">{inProgress} in progress</div>
      <div className="text-emerald-600 dark:text-emerald-400 text-xs mt-0.5">{mastered} mastered</div>
    </div>
  )
}

export default function Profile() {
  const { user } = useAuth()
  const { masteryMap } = useMastery()
  const [items, setItems] = useState<ResponseItem[]>([])
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [loading, setLoading] = useState(true)
  const [karma, setKarma] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      api.get('/users/me/responses').then(setItems).catch(() => setItems([])),
      api.get('/questions').then((qs: Question[]) => setTotalQuestions(qs.length)).catch(() => {}),
      api.get('/auth/me').then((u) => setKarma(u.karma ?? 0)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const togglePublic = async (id: string, current?: boolean) => {
    await api.post(`/responses/${id}/public`, { is_public: !current })
    setItems((arr) => arr.map((r) => r.id === id ? { ...r, is_public: !current } : r))
  }

  const deleteResponse = async (id: string) => {
    if (!confirm('Delete this response? This cannot be undone.')) return
    await api.delete(`/responses/${id}`)
    setItems((arr) => arr.filter((r) => r.id !== id))
  }

  return (
    <div className={mainSidebar}>
      <div className={stack}>
        <h3 className="m-0">My responses</h3>
        {loading && <div className={`${card} ${muted} text-[13px]`}>Loading your responses…</div>}
        {!loading && items.length === 0 && (
          <div className={`${card} ${muted}`}>No responses yet. <Link to="/practice">Start practicing →</Link></div>
        )}
        {items.map((r) => (
          <div key={r.id} className={card}>
            <div className="flex justify-between items-center gap-2.5">
              <Link to={`/response/${r.id}`} className="text-skin-text hover:no-underline">
                <div className="font-semibold">{r.question_text}</div>
              </Link>
              {r.overall_score != null && <span className={scorePill}>{r.overall_score.toFixed(1)}/5</span>}
            </div>
            {(r.question_category || r.question_id) && (
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                {r.question_category && <span className={tag}>{r.question_category}</span>}
                {r.question_id && <MasteryDropdown questionId={r.question_id} />}
              </div>
            )}
            <div className={`${muted} mt-1`}>{r.transcript_preview}…</div>
            <div className={`${row} mt-2.5`}>
              <span className={tag}>{r.is_public ? 'Public' : 'Private'}</span>
              {r.is_public && (
                <span className={muted}>
                  ⭐ {r.avg_rating != null ? r.avg_rating.toFixed(1) : '—'}
                  {r.rating_count ? ` (${r.rating_count})` : ''}
                </span>
              )}
              {r.is_public && r.comment_count != null && (
                <span className={muted}>💬 {r.comment_count}</span>
              )}
              <div className="ml-auto flex gap-2">
                <button className={btnSmGhost} onClick={() => togglePublic(r.id, r.is_public)}>
                  {r.is_public ? 'Make private' : 'Make public'}
                </button>
                <button className={btnDanger} onClick={() => deleteResponse(r.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <aside className={sidebar}>
        <div className="text-center">
          {user?.picture && <img src={user.picture} alt="" className="w-[72px] h-[72px] rounded-full mx-auto" />}
          <h3>{user?.name}</h3>
          <div className={muted}>{user?.email}</div>
          <MasteryPie
            mastered={Object.values(masteryMap).filter(s => s === 'mastered').length}
            inProgress={Object.values(masteryMap).filter(s => s === 'in-progress').length}
            total={totalQuestions}
          />
          <div className="mt-3"><span className={scorePill}>Karma {karma ?? user?.karma ?? 0}</span></div>
          <p className={`${muted} text-xs mt-3.5`}>
            Karma is earned when the community upvotes your comments on other people's responses.
            Shared responses themselves are anonymous and earn no karma.
          </p>
        </div>
      </aside>
    </div>
  )
}
