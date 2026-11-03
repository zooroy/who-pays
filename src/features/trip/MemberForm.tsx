import { useState, type FormEvent } from 'react'
import { AvatarChoice, Button, Notice, TextField } from '../../components'
import { AVATAR_IDS, type AvatarId } from '../../lib/avatars'
import { membershipError } from '../../lib/identity'
import type { Member } from './api'

// TODO(lead): move to components
export function AvatarPicker({ value, onChange, members }: { value: AvatarId | null; onChange: (id: AvatarId) => void; members: Member[] }) {
  return <fieldset className="trip-fieldset"><legend>選一個角色</legend><div className="trip-avatars">
    {AVATAR_IDS.map(id => <AvatarChoice key={id} avatarId={id} selected={value === id} taken={members.some(m => m.avatar_id === id)} onSelect={onChange} />)}
  </div></fieldset>
}
export function MemberForm({ members, onSave, onRefresh, label }: { members: Member[]; onSave: (name: string, avatar: AvatarId) => Promise<void>; onRefresh: () => Promise<unknown>; label: string }) {
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<AvatarId | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const available = avatar !== null && !members.some(m => m.avatar_id === avatar)
  async function submit(event: FormEvent) {
    event.preventDefault()
    setAttempted(true)
    if (!name.trim() || !available || !avatar || busy) return
    setBusy(true)
    setError('')
    try { await onSave(name.trim(), avatar) }
    catch (err) { setError(membershipError(err)); await onRefresh() }
    finally { setBusy(false) }
  }
  return <form onSubmit={submit} className="trip-stack" noValidate>
    <TextField label="名字" value={name} onChange={e => setName(e.target.value)} error={attempted && !name.trim() ? '請輸入名字。' : undefined} />
    <AvatarPicker value={avatar} onChange={setAvatar} members={members} />
    {attempted && !available && <Notice tone="problem">請選擇一個未被使用的角色。</Notice>}
    {error && <Notice tone="problem">{error}</Notice>}
    <Button type="submit" busy={busy}>{label}</Button>
  </form>
}
