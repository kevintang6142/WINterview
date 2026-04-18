interface Props {
  timeline?: number[]
  durationSeconds?: number
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return `${m}:${ss}`
}

const WINDOW = 5 // seconds per bucket, must match backend

export default function PacingGraph({ timeline = [], durationSeconds = 0 }: Props) {
  const W = 520
  const H = 200
  const PAD_L = 40
  const PAD_R = 12
  const PAD_T = 12
  const PAD_B = 28
  const BAR_GAP = 2

  const n = timeline.length
  if (n === 0 || durationSeconds < WINDOW) {
    return <div className="text-skin-muted text-sm">No pacing data (response too short).</div>
  }

  const maxWpm = Math.max(60, ...timeline) * 1.1
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const xForTime = (t: number) => PAD_L + (t / durationSeconds) * innerW
  const yFor = (v: number) => PAD_T + innerH - (v / maxWpm) * innerH

  // Y-axis gridlines / labels
  const step = Math.max(25, Math.ceil(maxWpm / 4 / 25) * 25)
  const yTicks: number[] = []
  for (let v = 0; v <= maxWpm; v += step) yTicks.push(v)

  // X-axis tick marks every 5 seconds
  const xTicks: number[] = []
  for (let t = 0; t <= durationSeconds; t += WINDOW) xTicks.push(t)
  if (xTicks[xTicks.length - 1] < durationSeconds) xTicks.push(durationSeconds)

  // Build bars: bar i spans [i*WINDOW, min((i+1)*WINDOW, duration)]
  const bars = timeline.map((v, i) => {
    const t0 = i * WINDOW
    const t1 = Math.min((i + 1) * WINDOW, durationSeconds)
    const x = xForTime(t0) + BAR_GAP / 2
    const w = Math.max(0, xForTime(t1) - xForTime(t0) - BAR_GAP)
    const h = (v / maxWpm) * innerH
    const y = PAD_T + innerH - h
    return { x, w, h, y, v }
  })

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', maxWidth: W, height: 'auto', display: 'block' }}
      role="img"
      aria-label="Pacing over time"
    >
      {/* Y-axis gridlines + labels */}
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line
            x1={PAD_L} x2={W - PAD_R}
            y1={yFor(v)} y2={yFor(v)}
            stroke="var(--border)"
            strokeDasharray="3 4"
          />
          <text
            x={PAD_L - 6} y={yFor(v) + 4}
            fontSize="11" textAnchor="end"
            fill="var(--text-muted)"
          >
            {v}
          </text>
        </g>
      ))}

      {/* Bars */}
      {bars.map(({ x, w, h, y }, i) => (
        <rect
          key={i}
          x={x} y={y}
          width={w} height={h}
          fill="var(--accent)"
          opacity="0.8"
          rx="2"
        />
      ))}

      {/* X-axis tick marks + labels every 5 s */}
      {xTicks.map((t, idx) => {
        const xi = xForTime(t)
        return (
          <g key={t}>
            <line
              x1={xi} x2={xi}
              y1={PAD_T + innerH} y2={PAD_T + innerH + 4}
              stroke="var(--border)"
            />
            <text
              x={xi} y={H - 4}
              fontSize="11"
              textAnchor={idx === 0 ? 'start' : idx === xTicks.length - 1 ? 'end' : 'middle'}
              fill="var(--text-muted)"
            >
              {fmt(t)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

