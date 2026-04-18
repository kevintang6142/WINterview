import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import PacingGraph from '../components/PacingGraph'
import { main, card, stack, row, muted, tag, bigQuestion, metricRow, metricName, metricFb, metricScore, btnPrimary, btnSmGhost, btnDanger } from '../lib/ui'
import { CategoryRating, Comment, Evaluation, MetricData } from '../types'

const METRICS: [keyof Evaluation, string][] = [
  ['structure_star', 'Structure (STAR)'],
  ['specificity_depth', 'Specificity & Depth'],
  ['delivery_pacing', 'Delivery (Pacing & Fillers)'],
  ['relevance', 'Relevance to Question'],
  ['reflection', 'Reflection & Self-Awareness'],
]

const RATING_CATEGORIES: { key: keyof CategoryRating; label: string; guide: string }[] = [
  {
    key: 'structure_star',
    label: 'Structure (STAR)',
    guide: '1 = no structure; 3 = situation/task clear but action/result vague; 5 = crisp STAR narrative with clear outcome',
  },
  {
    key: 'specificity_depth',
    label: 'Specificity & Depth',
    guide: '1 = generic answers; 3 = some concrete details; 5 = vivid, specific examples with measurable results',
  },
  {
    key: 'delivery_pacing',
    label: 'Delivery & Pacing',
    guide: '1 = hard to follow, lots of fillers; 3 = mostly clear with minor hesitations; 5 = fluent, well-paced, confident',
  },
  {
    key: 'relevance',
    label: 'Relevance to Question',
    guide: '1 = off-topic; 3 = addresses question broadly; 5 = directly and fully answers what was asked',
  },
  {
    key: 'reflection',
    label: 'Reflection & Self-Awareness',
    guide: '1 = no reflection; 3 = acknowledges outcome; 5 = clear lesson learned and personal growth articulated',
  },
]

function fmtDuration(seconds?: number) {
  if (!seconds || seconds <= 0) return 'Text response'
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function CategoryRatingForm({
  myRating,
  onRate,
  disabled,
}: {
  myRating?: CategoryRating | null
  onRate: (r: CategoryRating) => void
  disabled?: boolean
}) {
  const empty: CategoryRating = { structure_star: 0, specificity_depth: 0, delivery_pacing: 0, relevance: 0, reflection: 0 }
  const [draft, setDraft] = useState<CategoryRating>(myRating ?? empty)

  useEffect(() => { if (myRating) setDraft(myRating) }, [myRating])

  const setScore = (key: keyof CategoryRating, val: number) =>
    setDraft((d) => ({ ...d, [key]: val }))

  const allFilled = Object.values(draft).every((v) => v > 0)

  if (disabled) return null

  return (
    <div className={stack}>
      <h4 className="m-0">Rate this response</h4>
      {RATING_CATEGORIES.map(({ key, label, guide }) => (
        <div key={key}>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-sm font-medium">{label}</span>
            <span className={`${muted} text-xs`}>{draft[key] > 0 ? `${draft[key]}/5` : ''}</span>
          </div>
          <div className={`${muted} text-xs mb-1.5`}>{guide}</div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setScore(key, n)}
                className={`w-9 h-9 rounded text-sm font-semibold border transition-colors ${
                  draft[key] >= n
                    ? 'bg-skin-accent text-white border-skin-accent'
                    : 'border-skin-border text-skin-muted hover:border-skin-accent'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div>
        <button
          className={btnPrimary}
          disabled={!allFilled}
          onClick={() => onRate(draft)}
        >
          {myRating ? 'Update rating' : 'Submit rating'}
        </button>
      </div>
    </div>
  )
}

function VoteButton({
  direction,
  active,
  count,
  onClick,
}: {
  direction: 'up' | 'down'
  active: boolean
  count: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center w-7 h-7 rounded text-sm font-bold transition-colors ${
        active
          ? direction === 'up'
            ? 'text-orange-500'
            : 'text-blue-500'
          : 'text-skin-muted hover:text-skin-text'
      }`}
      title={direction === 'up' ? 'Upvote' : 'Downvote'}
    >
      {direction === 'up' ? '▲' : '▼'}
    </button>
  )
}

function CommentVotes({ commentId, initialLike = 0, initialDislike = 0, initialMine = 0, isOwn }: {
  commentId: string; initialLike?: number; initialDislike?: number; initialMine?: number; isOwn?: boolean
}) {
  const { user } = useAuth()
  const [counts, setCounts] = useState({ like: initialLike, dislike: initialDislike, mine: initialMine })
  const send = async (value: number) => {
    if (!user) return alert('Sign in to vote')
    const next = counts.mine === value ? 0 : value
    const r = await api.post(`/responses/comments/${commentId}/react`, { value: next })
    setCounts({ like: r.like_count, dislike: r.dislike_count, mine: next })
  }
  const score = counts.like - counts.dislike
  return (
    <div className="flex items-center gap-0.5">
      <VoteButton direction="up" active={counts.mine === 1} count={counts.like} onClick={() => send(1)} />
      <span className={`text-xs font-semibold w-6 text-center ${score > 0 ? 'text-orange-500' : score < 0 ? 'text-blue-500' : muted}`}>
        {score}
      </span>
      <VoteButton direction="down" active={counts.mine === -1} count={counts.dislike} onClick={() => send(-1)} />
    </div>
  )
}

interface ResponseData {
  question_text: string; is_public: boolean; is_owner: boolean; transcript: string
  duration_seconds?: number; created_at?: string
  avg_rating?: number | null; rating_count?: number
  my_rating?: CategoryRating | null; evaluation?: Evaluation
}

export default function ResponseDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const nav = useNavigate()
  const [data, setData] = useState<ResponseData | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [draft, setDraft] = useState('')

  const load = () => {
    api.get(`/responses/${id}`).then(setData).catch(() => setData(null))
    api.get(`/responses/${id}/comments`).then(setComments).catch(() => setComments([]))
  }
  useEffect(load, [id])

  const rate = async (rating: CategoryRating) => {
    if (!user) return alert('Sign in to rate')
    const r = await api.post(`/responses/${id}/rate`, rating)
    setData((d) => d ? { ...d, avg_rating: r.avg_rating, rating_count: r.rating_count, my_rating: rating } : null)
  }

  const togglePublic = async () => {
    if (!data) return
    await api.post(`/responses/${id}/public`, { is_public: !data.is_public })
    setData((d) => d ? { ...d, is_public: !d.is_public } : null)
  }

  const deleteResponse = async () => {
    if (!confirm('Delete this response? This cannot be undone.')) return
    await api.delete(`/responses/${id}`)
    nav(-1)
  }

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.trim()) return
    await api.post(`/responses/${id}/comments`, { body: draft.trim() })
    setDraft(''); load()
  }

  if (!data) return <div className={main}><div className={card}>Loading…</div></div>

  const ev = data.evaluation || {}
  const isOwner = data.is_owner
  const fillerEntries = ev.filler_words ? Object.entries(ev.filler_words) : []

  return (
    <div className={main}>
      <div className={stack}>
        <div className={card}>
          <div className={bigQuestion}>{data.question_text}</div>
          <div className={`${row} flex-wrap gap-x-3 ${muted}`}>
            <span>{data.is_public ? 'Public' : 'Private'}</span>
            <span>Time: <strong>{fmtDuration(data.duration_seconds || ev.duration_seconds)}</strong></span>
            {ev.word_count != null && <span>Words: <strong>{ev.word_count}</strong></span>}
            {data.created_at && (
              <span className="ml-auto text-xs">{new Date(data.created_at).toLocaleString()}</span>
            )}
          </div>

          {isOwner && (
            <div className={`${row} gap-2 mt-3`}>
              <button className={btnSmGhost} onClick={togglePublic}>
                {data.is_public ? 'Make private' : 'Share publicly'}
              </button>
            </div>
          )}

          <div className={`${card} bg-skin-surface-2 mt-3.5`}>
            <strong>Response</strong>
            <p className="whitespace-pre-wrap mt-1.5">{data.transcript}</p>
          </div>

          {ev.pacing_timeline && ev.pacing_timeline.length > 0 && (
            <div className="mt-4">
              <div className={`${muted} mb-1.5`}>Average pacing: <strong>{ev.words_per_minute ?? 0} WPM</strong></div>
              <PacingGraph timeline={ev.pacing_timeline} durationSeconds={ev.duration_seconds || data.duration_seconds || 0} />
              <div className={`${row} flex-wrap gap-2 mt-2.5`}>
                <strong>{ev.filler_count ?? 0} filler words</strong>
                {fillerEntries.map(([w, n]) => <span key={w} className={tag}>{w}: {n}</span>)}
              </div>
            </div>
          )}

          {isOwner && ev.structure_star && (
            <div className="mt-4">
              <h3 className="mb-1">AI feedback <span className={`${muted} font-normal`}>(only you can see this)</span></h3>
              {METRICS.map(([k, label]) => ev[k] && (
                <div key={k} className={metricRow}>
                  <div><div className={metricName}>{label}</div><div className={metricFb}>{(ev[k] as MetricData).feedback}</div></div>
                  <div className={metricScore}>{(ev[k] as MetricData).score.toFixed(1)}/5</div>
                </div>
              ))}
              {ev.overall != null && <div className={`${muted} mt-2.5`}>Overall: <strong>{ev.overall.toFixed?.(1) ?? ev.overall}/5</strong></div>}
            </div>
          )}
        </div>

        {data.is_public && (
          <div className={card}>
            {data.avg_rating != null && (
              <div className={`${muted} mb-4`}>
                Community rating: <strong>{data.avg_rating.toFixed(1)}/5</strong>
                {data.rating_count ? ` (${data.rating_count} rating${data.rating_count === 1 ? '' : 's'})` : ''}
              </div>
            )}

            {!isOwner && (
              <CategoryRatingForm myRating={data.my_rating} onRate={rate} />
            )}
            {isOwner && (
              <div className={`${muted} text-sm`}>You cannot rate your own response.</div>
            )}
          </div>
        )}

        {data.is_public && (
          <div className={card}>
            <h3 className="mt-0 mb-3">Comments ({comments.length})</h3>
            {user && !isOwner ? (
              <form onSubmit={addComment}>
                <textarea placeholder="Leave constructive feedback…" value={draft} onChange={(e) => setDraft(e.target.value)} />
                <div className="mt-2"><button className={btnPrimary} disabled={!draft.trim()}>Post comment</button></div>
              </form>
            ) : user && isOwner ? (
              <div className={`${muted} text-sm`}>You cannot comment on your own response.</div>
            ) : (
              <div className={muted}>Sign in to comment.</div>
            )}

            <div className={`${stack} mt-3.5`}>
              {comments.map((c) => {
                const isOwn = user?.id === c.user_id
                return (
                  <div key={c.id} className={`${card} bg-skin-surface-2`}>
                    <div className="flex gap-3 items-start">
                      {/* Reddit-style vote column */}
                      <div className="flex flex-col items-center">
                        <CommentVotes
                          commentId={c.id}
                          initialLike={c.like_count}
                          initialDislike={c.dislike_count}
                          initialMine={c.my_reaction}
                          isOwn={isOwn}
                        />
                      </div>
                      {/* Comment content */}
                      <div className="flex-1 min-w-0">
                        <div className={row}>
                          {c.user_picture && <img className="w-6 h-6 rounded-full object-cover" src={c.user_picture} alt="" />}
                          <strong className="text-sm">{c.user_name}</strong>
                          {isOwn && <span className={`${tag} text-xs`}>you</span>}
                          <span className={`${muted} ml-auto text-xs`}>{new Date(c.created_at).toLocaleString()}</span>
                        </div>
                        <p className="mt-1.5 mb-0 text-sm">{c.body}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {isOwner && (
          <div className={`${card} ${row} gap-2`}>
            <button className={btnSmGhost} onClick={togglePublic}>
              {data.is_public ? 'Make private' : 'Share publicly'}
            </button>
            <button className={btnDanger} onClick={deleteResponse}>Delete</button>
          </div>
        )}
      </div>
    </div>
  )
}
