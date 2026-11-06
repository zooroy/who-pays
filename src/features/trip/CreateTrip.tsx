import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { AppShell, AvatarPicker, Button, Notice, SelectField, TextField } from '../../components'
import { AVATARS, memberName, type AvatarId } from '../../lib/avatars'
import { CURRENCIES, isCurrencyCode, type CurrencyCode } from '../../lib/money'
import { membershipError } from '../../lib/identity'
import { useAccount } from '../account/account'
import { createTrip } from './api'

export function CreateTripForm() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [yourName, setYourName] = useState('')
  const [currency, setCurrency] = useState<CurrencyCode>('TWD')
  const [avatar, setAvatar] = useState<AvatarId>('bear')
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setAttempted(true)
    if (!name.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const trip = await createTrip(name.trim(), currency, memberName(yourName, avatar), avatar)
      navigate(`/t/${trip.shareToken}`)
    } catch (err) {
      setError(membershipError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="trip-stack" onSubmit={submit} noValidate>
      <TextField
        label="旅程名稱"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={attempted && !name.trim() ? '請輸入旅程名稱。' : undefined}
      />
      <SelectField
        label="主要貨幣"
        value={currency}
        onChange={(e) => {
          if (isCurrencyCode(e.target.value)) setCurrency(e.target.value)
        }}
      >
        {Object.values(CURRENCIES).map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}（{c.code}）
          </option>
        ))}
      </SelectField>
      <TextField
        label="你的名字（選填）"
        value={yourName}
        placeholder={AVATARS[avatar].name}
        onChange={(e) => setYourName(e.target.value)}
      />
      <AvatarPicker value={avatar} onChange={setAvatar} takenIds={[]} />
      {error && <Notice tone="problem">{error}</Notice>}
      <Button type="submit" busy={busy}>
        建立旅程
      </Button>
    </form>
  )
}

/** Only the owner can create trips (owner-account spec); everyone else goes home. */
export function CreateTrip() {
  const account = useAccount()
  if (account.isPending) return null
  if (!account.data?.isOwner) return <Navigate to="/" replace />
  return (
    <AppShell title="建立旅程" back={{ to: '/', label: '回到我的旅程' }}>
      <CreateTripForm />
    </AppShell>
  )
}
