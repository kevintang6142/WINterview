/**
 * Shared Tailwind class string constants.
 * Importing these keeps component JSX readable and ensures consistency.
 */

// ── Layout ────────────────────────────────────────────────────────────────────
export const main =
  'max-w-[1100px] mx-auto w-full px-4 sm:px-5 py-6 pb-16 grid grid-cols-1 gap-5'
export const mainSidebar =
  'max-w-[1100px] mx-auto w-full px-4 sm:px-5 py-6 pb-16 grid grid-cols-1 min-[900px]:grid-cols-[1fr_280px] gap-5'
export const sidebar =
  'bg-skin-surface border border-skin-border rounded-skin p-4 h-fit'

// ── Card ──────────────────────────────────────────────────────────────────────
export const card =
  'bg-skin-surface border border-skin-border rounded-skin p-4 shadow-skin'

// ── Utility classes ───────────────────────────────────────────────────────────
export const row    = 'flex items-center gap-2.5 flex-wrap'
export const spread = 'flex justify-between items-center gap-2.5 flex-wrap'
export const stack  = 'flex flex-col gap-2.5'
export const muted  = 'text-skin-muted text-[13px]'

export const tag =
  'inline-block px-2 py-0.5 rounded-full text-xs ' +
  'bg-[var(--blue-100)] text-[var(--blue-800)] ' +
  'dark:bg-[rgba(96,165,250,0.15)] dark:text-[var(--blue-300)]'

export const scorePill =
  'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold ' +
  'bg-[var(--blue-50)] text-[var(--blue-800)] ' +
  'dark:bg-[rgba(59,130,246,0.15)] dark:text-[var(--blue-300)]'

export const banner =
  'px-3.5 py-2.5 rounded-skin text-[13px] ' +
  'bg-[var(--blue-50)] text-[var(--blue-800)] border border-[var(--blue-200)] ' +
  'dark:bg-[rgba(59,130,246,0.1)] dark:text-[var(--blue-300)] dark:border-[var(--blue-800)]'

export const bigQuestion =
  'text-[22px] font-extrabold leading-tight px-[18px] py-4 mb-3.5 ' +
  'rounded-skin border-l-4 border-skin-accent bg-skin-surface-2 text-skin-text'

// ── Spinner ───────────────────────────────────────────────────────────────────
export const spinner =
  'w-[42px] h-[42px] rounded-full mx-auto border-4 border-skin-border border-t-skin-accent animate-spin'

// ── TTS word highlighting ─────────────────────────────────────────────────────
export const ttsWord   = 'transition-[background,color] duration-75'
export const ttsActive =
  'bg-[var(--blue-100)] text-[var(--blue-900)] rounded px-0.5 ' +
  'shadow-[0_0_0_2px_var(--blue-100)] ' +
  'dark:bg-[rgba(96,165,250,0.25)] dark:text-[var(--blue-200)] ' +
  'dark:shadow-[0_0_0_2px_rgba(96,165,250,0.25)]'

// ── Metric rows (feedback pages) ──────────────────────────────────────────────
export const metricRow =
  'grid grid-cols-[1fr_auto] gap-2.5 py-2.5 border-b border-dashed border-skin-border last:border-b-0'
export const metricName  = 'font-semibold'
export const metricFb    = 'text-skin-muted text-[13px] mt-0.5'
export const metricScore = 'font-bold text-lg text-skin-accent'

// ── Autocomplete dropdown ─────────────────────────────────────────────────────
export const autocomplete =
  'absolute top-[calc(100%+4px)] left-0 right-0 ' +
  'bg-skin-surface border border-skin-border rounded-skin shadow-skin ' +
  'max-h-64 overflow-y-auto z-20'
export const autocompleteItem = (active: boolean) =>
  `px-3 py-2 cursor-pointer text-sm${active ? ' bg-skin-surface-2' : ' hover:bg-skin-surface-2'}`

// ── Buttons ───────────────────────────────────────────────────────────────────
const _base =
  'inline-flex items-center justify-center font-semibold cursor-pointer ' +
  'transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-skin'

export const btnPrimary =
  `${_base} text-sm px-3.5 py-2 bg-skin-accent text-white border-0 hover:bg-[var(--blue-700)]`
export const btnGhost =
  `${_base} text-sm px-3.5 py-2 bg-transparent text-skin-text border border-skin-border hover:bg-skin-surface-2`
export const btnDanger =
  `${_base} text-sm px-3.5 py-2 bg-skin-danger text-white border-0 hover:opacity-90`
export const btnSmGhost =
  `${_base} text-[13px] px-2.5 py-1 bg-transparent text-skin-text border border-skin-border hover:bg-skin-surface-2`
export const btnSm =
  `${_base} text-[13px] px-2.5 py-1 bg-skin-accent text-white border-0 hover:bg-[var(--blue-700)]`

// ── Thumb (avatar) ────────────────────────────────────────────────────────────
export const thumb = 'w-7 h-7 rounded-full object-cover'

// ── Stars rating ──────────────────────────────────────────────────────────────
export const starsContainer = 'inline-flex gap-0.5 text-base'
export const starOff = 'cursor-pointer text-gray-300 dark:text-slate-600'
export const starOn  = 'cursor-pointer text-amber-400'
