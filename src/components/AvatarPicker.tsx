import { AvatarChoice } from './Avatar'
import { AVATAR_IDS, type AvatarId } from '../lib/avatars'
import './AvatarPicker.css'

interface AvatarPickerProps {
  value: AvatarId | null
  onChange: (id: AvatarId) => void
  takenIds: readonly AvatarId[]
}

export function AvatarPicker({ value, onChange, takenIds }: AvatarPickerProps) {
  return (
    <fieldset className="avatar-picker">
      <legend>選一個角色</legend>
      <div className="avatar-picker__choices">
        {AVATAR_IDS.map((id) => (
          <AvatarChoice
            key={id}
            avatarId={id}
            selected={value === id}
            taken={takenIds.includes(id)}
            onSelect={onChange}
          />
        ))}
      </div>
    </fieldset>
  )
}
