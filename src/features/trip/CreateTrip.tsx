import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { AppShell, AvatarPicker, Button, Notice, SelectField, TextField } from '../../components'
import { type AvatarId } from '../../lib/avatars'
import { CURRENCIES, isCurrencyCode, type CurrencyCode } from '../../lib/money'
import { membershipError, saveIdentity } from '../../lib/identity'
import { createTrip } from './api'

export function CreateTrip() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [memberName, setMemberName] = useState('')
  const [currency, setCurrency] = useState<CurrencyCode>('TWD')
  const [avatar, setAvatar] = useState<AvatarId>('bear')
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setAttempted(true)
    if (!name.trim() || !memberName.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const trip = await createTrip(name.trim(), currency, memberName.trim(), avatar)
      saveIdentity(trip.tripId, trip.memberId)
      navigate(`/t/${trip.shareToken}`)
    } catch (err) {
      setError(membershipError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <AppShell title="建立旅程">
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
          label="你的名字"
          value={memberName}
          onChange={(e) => setMemberName(e.target.value)}
          error={attempted && !memberName.trim() ? '請輸入你的名字。' : undefined}
        />
        <AvatarPicker value={avatar} onChange={setAvatar} takenIds={[]} />
        {error && <Notice tone="problem">{error}</Notice>}
        <Button type="submit" busy={busy}>
          建立旅程
        </Button>
      </form>
    </AppShell>
  )
}
