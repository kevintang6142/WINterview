import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App'
import { ThemeProvider } from './theme'
import { AuthProvider } from './auth'
import { SettingsProvider } from './settings'
import { MasteryProvider } from './mastery'
import './styles.css'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        <SettingsProvider>
          <AuthProvider>
            <BrowserRouter>
              <MasteryProvider>
                <App />
              </MasteryProvider>
            </BrowserRouter>
          </AuthProvider>
        </SettingsProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
)
