import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig(({ mode }) => {
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
