import { Link } from 'react-router-dom'
import { ResponseItem } from '../types'
import { card, muted } from '../lib/ui'
import { useAuth } from '../auth'

interface Props { item: ResponseItem }

export default function ResponseCard({ item }: Props) {
  const { user } = useAuth()
  const rating = item.avg_rating
  const rc = item.rating_count ?? 0
  const dest = user ? `/response/${item.id}` : '/login'

  return (
    <Link to={dest} className="text-skin-text hover:no-underline block">
      <div className={`${card} cursor-pointer`}>
        <div className="font-semibold mb-1.5">{item.question_text}</div>
        <div className="text-skin-muted text-sm">{item.transcript_preview}…</div>
        <div className={`flex items-center flex-wrap gap-3.5 mt-2.5 ${muted}`}>
          <span>⭐ {rating != null ? rating.toFixed(1) : '—'}{rc ? ` (${rc})` : ''}</span>
          {item.words_per_minute != null && <span>{Math.round(item.words_per_minute)} WPM</span>}
          {item.filler_count != null && <span>{item.filler_count} fillers</span>}
        </div>
      </div>
    </Link>
  )
}
