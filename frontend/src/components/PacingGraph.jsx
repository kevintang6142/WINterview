/**
 * SVG line chart of words-per-minute over time.
 * X-axis: time (mm:ss) — buckets are evenly spaced across the full duration.
 * Y-axis: WPM, with a few tick labels.
 * No titles or axis labels (by spec).
 */
function fmt(seconds) {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return `${m}:${ss}`
}

export default function PacingGraph({ timeline = [], durationSeconds = 0 }) {
  const W = 520
  const H = 200
  const PAD_L = 40
  const PAD_R = 12
  const PAD_T = 12
  const PAD_B = 28

  const n = timeline.length
  if (n === 0 || durationSeconds <= 0) {
    return <div className="muted">No pacing data.</div>
  }

  const maxWpm = Math.max(60, ...timeline) * 1.1
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const xFor = (i) => PAD_L + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yFor = (v) => PAD_T + innerH - (v / maxWpm) * innerH

  // Y ticks — choose 4 evenly spaced "nice" values up to maxWpm.
  const ticks = []
  const step = Math.max(25, Math.ceil(maxWpm / 4 / 25) * 25)
  for (let v = 0; v <= maxWpm; v += step) ticks.push(v)

  // X ticks — start, mid, end.
  const xTicks = [0, durationSeconds / 2, durationSeconds]

  const pathD = timeline
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`)
    .join(' ')

  // Area fill under the line for visual weight.
  const areaD =
    `M ${xFor(0)} ${yFor(0)} ` +
    timeline.map((v, i) => `L ${xFor(i)} ${yFor(v)}`).join(' ') +
    ` L ${xFor(n - 1)} ${yFor(0)} Z`

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', maxWidth: W, height: 'auto', display: 'block' }}
      role="img"
      aria-label="Pacing over time"
    >
      {/* Y-axis grid + ticks */}
      {ticks.map((v) => (
        <g key={`y${v}`}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={yFor(v)}
            y2={yFor(v)}
            stroke="var(--border)"
            strokeDasharray="3 4"
          />
          <text
            x={PAD_L - 6}
            y={yFor(v) + 4}
            fontSize="11"
            textAnchor="end"
            fill="var(--text-muted)"
          >
            {v}
          </text>
        </g>
      ))}

      {/* X-axis ticks */}
      {xTicks.map((t, i) => {
        const frac = durationSeconds === 0 ? 0 : t / durationSeconds
        const x = PAD_L + frac * innerW
        return (
          <g key={`x${i}`}>
            <line
              x1={x}
              x2={x}
              y1={H - PAD_B}
              y2={H - PAD_B + 4}
              stroke="var(--border)"
            />
            <text
              x={x}
              y={H - PAD_B + 16}
              fontSize="11"
              textAnchor="middle"
              fill="var(--text-muted)"
            >
              {fmt(t)}
            </text>
          </g>
        )
      })}

      {/* Axis lines */}
      <line
        x1={PAD_L}
        y1={PAD_T}
        x2={PAD_L}
        y2={H - PAD_B}
        stroke="var(--border)"
      />
      <line
        x1={PAD_L}
        y1={H - PAD_B}
        x2={W - PAD_R}
        y2={H - PAD_B}
        stroke="var(--border)"
      />

      {/* Area + line */}
      <path d={areaD} fill="var(--blue-400)" opacity="0.15" />
      <path
        d={pathD}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Dots */}
      {timeline.map((v, i) => (
        <circle
          key={i}
          cx={xFor(i)}
          cy={yFor(v)}
          r="3"
          fill="var(--accent)"
        />
      ))}
    </svg>
  )
}
