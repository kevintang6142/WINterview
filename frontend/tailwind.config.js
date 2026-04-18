/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        skin: {
          bg:        'var(--bg)',
          surface:   'var(--surface)',
          'surface-2': 'var(--surface-2)',
          border:    'var(--border)',
          text:      'var(--text)',
          muted:     'var(--text-muted)',
          accent:    'var(--accent)',
          danger:    'var(--danger)',
          success:   'var(--success)',
        },
      },
      borderRadius: { skin: '10px' },
      maxWidth:     { content: '1100px' },
      boxShadow:    { skin: 'var(--shadow)' },
      keyframes: {
        'mic-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(220,38,38,0.4)' },
          '50%':       { boxShadow: '0 0 0 12px rgba(220,38,38,0)' },
        },
      },
      animation: { 'mic-pulse': 'mic-pulse 1.2s ease infinite' },
    },
  },
  plugins: [],
}
