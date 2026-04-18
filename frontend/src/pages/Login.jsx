import { GoogleLogin } from '@react-oauth/google'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import Logo from '../components/Logo'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()

  return (
    <div className="main">
      <div className="card" style={{ maxWidth: 440, margin: '40px auto', textAlign: 'center' }}>
        <div style={{ marginBottom: 20 }}>
          <Logo />
        </div>
        <p className="muted" style={{ marginBottom: 24 }}>
          Sign in with Google to start practicing and share your responses.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <GoogleLogin
            onSuccess={async (cred) => {
              if (cred.credential) {
                await login(cred.credential)
                nav('/')
              }
            }}
            onError={() => alert('Google sign-in failed')}
          />
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 20 }}>
          If you see a config error, make sure <code>VITE_GOOGLE_CLIENT_ID</code> is
          set in your root <code>.env</code>.
        </p>
      </div>
    </div>
  )
}
