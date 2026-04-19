import { Link } from 'react-router-dom'
import { ResponseItem } from '../types'
import { card, muted, tag, row, btnSmGhost, btnDanger } from '../lib/ui'
import { useAuth } from '../auth'
import MasteryDropdown from './MasteryDropdown'

interface Props {
  item: ResponseItem
  onTogglePublic?: (id: string, current: boolean) => void
  onDelete?: (id: string) => void
}

export default function ResponseCard({ item, onTogglePublic, onDelete }: Props) {
  const { user } = useAuth()
  const rating = item.avg_rating
  const rc = item.rating_count ?? 0
  const cc = item.comment_count ?? 0
  const dest = user ? `/response/${item.id}` : '/login'
  const showActions = item.is_owner && (onTogglePublic || onDelete)

  return (
    <div className={card}>
      <Link to={dest} className="text-skin-text hover:no-underline block">
        <div className="font-semibold mb-1.5">{item.question_text}</div>
      </Link>
      {(item.question_category || item.question_id) && (
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          {item.question_category && <span className={tag}>{item.question_category}</span>}
          {item.question_id && <MasteryDropdown questionId={item.question_id} />}
        </div>
      )}
      <Link to={dest} className="text-skin-text hover:no-underline block">
        <div className="text-skin-muted text-sm">{item.transcript_preview}…</div>
      </Link>
      <div className={`${row} flex-wrap gap-3.5 mt-2.5 ${muted}`}>
        <span>⭐ {rating != null ? rating.toFixed(1) : '—'}{rc ? ` (${rc})` : ''}</span>
        <span>💬 {cc}</span>
        {showActions && (
          <div className="ml-auto flex gap-2">
            {onTogglePublic && (
              <button className={btnSmGhost} onClick={() => onTogglePublic(item.id, !!item.is_public)}>
                {item.is_public ? 'Make private' : 'Make public'}
              </button>
            )}
            {onDelete && (
              <button className={btnDanger} onClick={() => onDelete(item.id)}>Delete</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
