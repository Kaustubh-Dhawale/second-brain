import { useState } from 'react'
import { signIn, signUp, authErrorMessage } from '../auth.js'

// Email/password sign-in & sign-up. Locks all data to your own account.
export default function AuthScreen() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'signin') await signIn(email.trim(), password)
      else await signUp(email.trim(), password)
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen center">
      <form className="card auth" onSubmit={submit}>
        <div className="brand-stack">
          <span className="logo lg" aria-hidden="true">b</span>
          <h1>Second Brain</h1>
        </div>
        <p className="muted">
          {mode === 'signin' ? 'Sign in to your brain.' : 'Create your account.'}
        </p>

        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="primary" type="submit" disabled={busy}>
          {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError(null)
          }}
        >
          {mode === 'signin'
            ? "No account yet? Create one"
            : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
