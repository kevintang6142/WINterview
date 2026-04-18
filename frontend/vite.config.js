import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  // Read .env from the repo root so backend and frontend share one file.
  const rootEnvDir = path.resolve(__dirname, '..')
  const env = loadEnv(mode, rootEnvDir, '')
  return {
    plugins: [react()],
    envDir: rootEnvDir,
    define: {
      'import.meta.env.VITE_API_BASE': JSON.stringify(env.VITE_API_BASE || 'http://localhost:8000'),
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(env.VITE_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID || ''),
    },
    server: { port: 5173 },
  }
})
