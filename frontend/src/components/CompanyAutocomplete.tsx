import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { autocomplete, autocompleteItem } from '../lib/ui'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function CompanyAutocomplete({ value, onChange, placeholder }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const latestQueryRef = useRef('')

  useEffect(() => {
    const q = (value || '').trim()
    if (q.length < 1) { setSuggestions([]); return }
    latestQueryRef.current = q
    const handle = setTimeout(async () => {
      try {
        const res = await api.get(`/suggest/company?q=${encodeURIComponent(q)}`)
        if (latestQueryRef.current !== q) return
        setSuggestions(Array.isArray(res) ? res : [])
      } catch { setSuggestions([]) }
    }, 250)
    return () => clearTimeout(handle)
  }, [value])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const pick = (s: string) => { onChange(s); setOpen(false); setActive(-1) }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + suggestions.length) % suggestions.length) }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(suggestions[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={value}
        placeholder={placeholder || 'Company (optional, e.g. Meta, Stripe, your startup)'}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className={autocomplete}>
          {suggestions.map((s, i) => (
            <div
              key={s}
              className={autocompleteItem(i === active)}
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
