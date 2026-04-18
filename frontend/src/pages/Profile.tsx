import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { mainSidebar, sidebar, card, stack, row, muted, tag, scorePill, btnSmGhost, btnDanger } from '../lib/ui'
import { ResponseItem } from '../types'

export default function Profile() {
  const { user } = useAuth()
  const [items, setItems] = useState<ResponseItem[]>([])

  useEffect(() => {
    api.get('/users/me/responses').then(setItems).catch(() => setItems([]))
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
        {items.length === 0 && (
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
            <div className={`${muted} mt-1`}>{r.transcript_preview}…</div>
            <div className={`${row} mt-2.5`}>
              <span className={tag}>{r.is_public ? 'Public' : 'Private'}</span>
              {r.is_public && (
                <span className={muted}>
                  ⭐ {r.avg_rating != null ? r.avg_rating.toFixed(1) : '—'}
                  {r.rating_count ? ` (${r.rating_count})` : ''}
                </span>
              )}
              <div className="ml-auto flex gap-2">
                <button className={btnSmGhost} onClick={() => togglePublic(r.id, r.is_public)}>
                  {r.is_public ? 'Make private' : 'Share publicly'}
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
          <div className="mt-3"><span className={scorePill}>Karma {user?.karma ?? 0}</span></div>
          <p className={`${muted} text-xs mt-3.5`}>
            Karma is earned when the community upvotes your comments on other people's responses.
            Shared responses themselves are anonymous and earn no karma.
          </p>
        </div>
      </aside>
    </div>
  )
}
