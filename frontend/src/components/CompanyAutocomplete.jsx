import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

/**
 * Free-form company input with debounced Brave-backed suggestions.
 * The user can always type anything — suggestions are a convenience,
 * not a required selection.
 */
export default function CompanyAutocomplete({ value, onChange, placeholder }) {
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrapRef = useRef(null)
  const latestQueryRef = useRef('')

  useEffect(() => {
    const q = (value || '').trim()
    if (q.length < 1) {
      setSuggestions([])
      return
    }
    latestQueryRef.current = q
    const handle = setTimeout(async () => {
      try {
        const res = await api.get(`/suggest/company?q=${encodeURIComponent(q)}`)
        // Ignore if the user kept typing since we fired.
        if (latestQueryRef.current !== q) return
        setSuggestions(Array.isArray(res) ? res : [])
      } catch {
        setSuggestions([])
      }
    }, 250)
    return () => clearTimeout(handle)
  }, [value])

  useEffect(() => {
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const pick = (s) => {
    onChange(s)
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (e) => {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pick(suggestions[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={value}
        placeholder={placeholder || 'Company (optional, e.g. Meta, Stripe, your startup)'}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="autocomplete">
          {suggestions.map((s, i) => (
            <div
              key={s}
              className={`autocomplete-item ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(s) }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
