import { useNavigate } from 'react-router-dom'

export default function BackButton() {
  const nav = useNavigate()
  return (
    <button
      onClick={() => nav(-1)}
      title="Go back"
      className="fixed top-[76px] left-6 z-20 w-11 h-11 rounded-full flex items-center justify-center bg-skin-surface border border-skin-border shadow-skin text-skin-muted hover:text-skin-text hover:bg-skin-surface-2 transition-colors text-lg"
    >
      ←
    </button>
  )
}
