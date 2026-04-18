import { useMastery, MasteryState } from '../mastery'
import { useTheme } from '../theme'

const LABELS: Record<MasteryState, string> = {
  'none': 'Not started',
  'in-progress': 'In progress',
  'mastered': 'Mastered',
}

const CONTAINER_STYLES: Record<MasteryState, string> = {
  'none': 'border-skin-border text-skin-muted',
  'in-progress': 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800',
  'mastered': 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800',
}

interface Props {
  questionId: string
  /** stop click events from bubbling (e.g. on a Link card) */
  stopPropagation?: boolean
}

export default function MasteryDropdown({ questionId, stopPropagation }: Props) {
  const { getState, setState } = useMastery()
  const { theme } = useTheme()
  const state = getState(questionId)

  return (
    <div className={`relative inline-flex items-center rounded-full border transition-colors ${CONTAINER_STYLES[state]}`}>
      <select
        value={state}
        onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
        onChange={(e) => {
          if (stopPropagation) e.stopPropagation()
          setState(questionId, e.target.value as MasteryState)
        }}
        className="w-auto bg-transparent text-inherit text-xs pl-2 pr-5 py-0.5 cursor-pointer appearance-none"
        style={{ colorScheme: theme }}
      >
        <option value="none">Not started</option>
        <option value="in-progress">In progress</option>
        <option value="mastered">Mastered</option>
      </select>
      <span className="pointer-events-none absolute right-1.5 text-[8px] leading-none opacity-60">▼</span>
    </div>
  )
}
