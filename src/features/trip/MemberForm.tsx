import { useState, type FormEvent } from 'react'
import { AvatarPicker, Button, Notice, TextField } from '../../components'
import { AVATARS, memberName, type AvatarId } from '../../lib/avatars'
import { hasErrorCode, membershipError } from '../../lib/identity'
import type { Member } from './api'

export function MemberForm({
  members,
  onSave,
  onRefresh,
  label,
  initial,
}: {
  members: Member[]
  /** Editing an existing member: prefill, and its own avatar stays selectable. */
  initial?: Member
  onSave: (name: string, avatar: AvatarId) => Promise<void>
  onRefresh: () => Promise<unknown>
  label: string
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [avatar, setAvatar] = useState<AvatarId | null>(initial?.avatar_id ?? null)
  const others = members.filter((m) => m.id !== initial?.id)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const available = avatar !== null && !others.some((m) => m.avatar_id === avatar)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setAttempted(true)
    if (!available || !avatar || busy) return
    setBusy(true)
    setError('')
    try {
      await onSave(memberName(name, avatar), avatar)
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
        label="名字（選填）"
        value={name}
        placeholder={avatar ? AVATARS[avatar].name : '留空時使用角色名稱'}
        onChange={(e) => setName(e.target.value)}
      />
      <AvatarPicker
        value={avatar}
        onChange={(id) => {
          setAvatar(id)
          setError('')
        }}
        takenIds={others.map((m) => m.avatar_id)}
      />
      {attempted && !available && <Notice tone="problem">請選擇一個未被使用的角色。</Notice>}
      {error && <Notice tone="problem">{error}</Notice>}
      <Button type="submit" busy={busy}>
        {label}
      </Button>
    </form>
  )
}
