import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Navigate, useNavigate } from 'react-router'
import { AppShell, Button, Notice, TextField } from '../../components'
import { signIn, signInError, useAccount } from './account'

/** 擁有者登入 (owner-account spec「擁有者登入」). There is no sign-up. */
export function LoginPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const account = useAccount()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (account.data?.signedIn) return <Navigate to="/" replace />
  async function submit(event: FormEvent) {
    event.preventDefault()
    setAttempted(true)
    if (!email.trim() || !password || busy) return
    setBusy(true)
    setError('')
    try {
      await signIn(email.trim(), password)
      // Everything cached belongs to the anonymous user that was just replaced.
      await queryClient.resetQueries()
      navigate('/', { replace: true })
    } catch (err) {
      setError(signInError(err))
      setBusy(false)
    }
  }
  return (
    <AppShell title="擁有者登入" back={{ to: '/', label: '我的旅程' }}>
      <form className="trip-stack" onSubmit={submit} noValidate>
        <p className="trip-hint">只有擁有者需要登入。朋友打開旅程連結就能使用，不用登入。</p>
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="off"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={attempted && !email.trim() ? '請輸入 email。' : undefined}
        />
        <TextField
          label="密碼"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={attempted && !password ? '請輸入密碼。' : undefined}
        />
        {error && <Notice tone="problem">{error}</Notice>}
        <Button type="submit" busy={busy}>
          登入
        </Button>
      </form>
    </AppShell>
  )
}
