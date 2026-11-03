import { useState, type FormEvent } from 'react'
import { AvatarPicker, Button, Notice, TextField } from '../../components'
import { type AvatarId } from '../../lib/avatars'
import { hasErrorCode, membershipError } from '../../lib/identity'
import type { Member } from './api'

export function MemberForm({
  members,
  onSave,
  onRefresh,
  label,
}: {
  members: Member[]
  onSave: (name: string, avatar: AvatarId) => Promise<void>
  onRefresh: () => Promise<unknown>
  label: string
}) {
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<AvatarId | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const available = avatar !== null && !members.some((m) => m.avatar_id === avatar)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setAttempted(true)
    if (!name.trim() || !available || !avatar || busy) return
    setBusy(true)
    setError('')
    try {
      await onSave(name.trim(), avatar)
    } catch (err) {
      setError(membershipError(err))
      if (hasErrorCode(err, 'AVATAR_TAKEN')) {
        setAttempted(false)
        setAvatar(null)
      }
      await onRefresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="trip-stack" noValidate>
      <TextField
        label="名字"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={attempted && !name.trim() ? '請輸入名字。' : undefined}
      />
      <AvatarPicker
        value={avatar}
        onChange={(id) => {
          setAvatar(id)
          setError('')
        }}
        takenIds={members.map((m) => m.avatar_id)}
      />
      {attempted && !available && <Notice tone="problem">請選擇一個未被使用的角色。</Notice>}
      {error && <Notice tone="problem">{error}</Notice>}
      <Button type="submit" busy={busy}>
        {label}
      </Button>
    </form>
  )
}
