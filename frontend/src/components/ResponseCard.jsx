import { Link } from 'react-router-dom'

export default function ResponseCard({ item }) {
  const rating = item.avg_rating
  return (
    <Link to={`/response/${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card feed-item">
        <div className="q">{item.question_text}</div>
        <div className="preview">{item.transcript_preview}…</div>
        <div className="row muted" style={{ marginTop: 10, gap: 14, flexWrap: 'wrap' }}>
          <span>👍 {item.like_count ?? 0}</span>
          <span>👎 {item.dislike_count ?? 0}</span>
          <span>
            ⭐ {rating != null ? rating.toFixed(1) : '—'}
            {item.rating_count ? ` (${item.rating_count})` : ''}
          </span>
          {item.words_per_minute != null && <span>{Math.round(item.words_per_minute)} WPM</span>}
          {item.filler_count != null && <span>{item.filler_count} fillers</span>}
        </div>
      </div>
    </Link>
  )
}
