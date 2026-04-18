import { GoogleLogin } from '@react-oauth/google'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import Logo from '../components/Logo'
import { card } from '../lib/ui'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-5 py-10">
      <div className={`${card} w-full max-w-xs text-center`}>
        <div className="mb-4"><Logo /></div>
        <p className="text-skin-muted text-[13px] mb-5">
          Sign in with Google to start practicing and share your responses.
        </p>
        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={async (cred) => {
              if (cred.credential) { await login(cred.credential); nav('/') }
            }}
            onError={() => alert('Google sign-in failed')}
          />
        </div>
      </div>
    </div>
  )
}
