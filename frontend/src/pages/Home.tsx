import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import ResponseCard from '../components/ResponseCard'
import { useAuth } from '../auth'
import { main, mainSidebar, sidebar, card, stack, spread, row, btnPrimary, btnGhost } from '../lib/ui'
import { ResponseItem, SortOrder, TimeRange } from '../types'

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'now',   label: 'Now' },
  { value: 'today', label: 'Today' },
  { value: 'week',  label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year',  label: 'This year' },
  { value: 'all',   label: 'All time' },
]

export default function Home() {
  const { user } = useAuth()
  const [items, setItems] = useState<ResponseItem[]>([])
  const [sort, setSort] = useState<SortOrder>('hot')
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = sort === 'top' ? `?sort=${sort}&time_range=${timeRange}` : `?sort=${sort}`
    api.get(`/responses/feed${params}`)
      .then(setItems).catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [sort, timeRange])

  const togglePublic = async (id: string, current: boolean) => {
    await api.post(`/responses/${id}/public`, { is_public: !current })
    if (current) {
      // Making private — remove from the public feed
      setItems((arr) => arr.filter((r) => r.id !== id))
    } else {
      setItems((arr) => arr.map((r) => r.id === id ? { ...r, is_public: true } : r))
    }
  }

  const deleteResponse = async (id: string) => {
    if (!confirm('Delete this response? This cannot be undone.')) return
    await api.delete(`/responses/${id}`)
    setItems((arr) => arr.filter((r) => r.id !== id))
  }

  return (
    <div className={mainSidebar}>
      <div className={stack}>
        <h3 className="m-0">Public responses</h3>
        <div className={`${card} ${spread} flex-wrap gap-2`}>
          <div className={`${row} gap-2 flex-wrap`}>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOrder)}
              style={{ width: 'auto' }}
            >
              <option value="hot">Hot</option>
              <option value="new">New</option>
              <option value="top">Top</option>
            </select>
            {sort === 'top' && (
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                style={{ width: 'auto' }}
              >
                {TIME_RANGE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            )}
          </div>
          {user
            ? <Link to="/practice" className={btnPrimary}>Start practice</Link>
            : <Link to="/login" className={btnPrimary}>Start practice</Link>}
        </div>

        {loading && <div className={`${card} text-skin-muted text-[13px]`}>Loading feed…</div>}
        {!loading && items.length === 0 && (
          <div className={`${card} text-skin-muted text-[13px]`}>
            No public responses yet. Be the first — start a practice session and
            toggle your response to public from the results page.
          </div>
        )}
        {items.map((item) => (
          <ResponseCard
            key={item.id}
            item={item}
            onTogglePublic={item.is_owner ? togglePublic : undefined}
            onDelete={item.is_owner ? deleteResponse : undefined}
          />
        ))}
      </div>

      <aside className={sidebar}>
        <h3 className="mt-0 mb-2">About</h3>
        <p className="text-skin-muted text-[13px]">
          WINterview is a behavioral interview practice app. Practice speaking
          your answers to random questions, get AI feedback on structure,
          specificity, pacing, relevance, and reflection, then optionally share
          your response for peer feedback.
        </p>
        <h3 className="mt-5 mb-2">Search</h3>
        <p className="text-skin-muted text-[13px]">
          Browse questions by keyword to see community responses.
        </p>
        <Link to="/search" className={`${btnGhost} mt-3`}>Browse questions</Link>
      </aside>
    </div>
  )
}
