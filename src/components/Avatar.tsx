import { AVATARS, type AvatarId } from '../lib/avatars'
import './Avatar.css'

export type AvatarSize = 'small' | 'medium' | 'large'

interface AvatarProps {
  avatarId: AvatarId
  size?: AvatarSize
  /** Draws the ring that marks the current user. */
  isMe?: boolean
  /** Accessible name, usually the member's name. Defaults to the mascot name. */
  label?: string
  /** Hide from assistive tech when a visible name sits next to the avatar. */
  decorative?: boolean
}

/** A member's mascot. In lists the avatar stands in for the person's name. */
export function Avatar({ avatarId, size = 'medium', isMe = false, label, decorative = false }: AvatarProps) {
  const avatar = AVATARS[avatarId]
  const name = label ?? avatar.name
  return (
    <span
      className={`avatar avatar--${size}${isMe ? ' avatar--me' : ''}`}
      style={{ '--avatar-tint': avatar.tint } as React.CSSProperties}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : isMe ? `${name}（你）` : name}
      aria-hidden={decorative || undefined}
    >
      {avatar.image ? (
        <img className="avatar__image" src={avatar.image} alt="" draggable={false} />
      ) : (
        <span className={`avatar__placeholder${avatar.glyph.length > 1 ? ' avatar__placeholder--pair' : ''}`} aria-hidden="true">
          {avatar.glyph}
        </span>
      )}
    </span>
  )
}

interface AvatarChoiceProps {
  avatarId: AvatarId
  selected: boolean
  /** Already used by another member of this trip. */
  taken?: boolean
  onSelect: (id: AvatarId) => void
}

/** One option in an avatar picker. Taken avatars stay visible but cannot be chosen. */
export function AvatarChoice({ avatarId, selected, taken = false, onSelect }: AvatarChoiceProps) {
  const avatar = AVATARS[avatarId]
  return (
    <button
      type="button"
      className={`avatar-choice${selected ? ' avatar-choice--selected' : ''}`}
      aria-pressed={selected}
      disabled={taken}
      onClick={() => onSelect(avatarId)}
    >
      <Avatar avatarId={avatarId} size="large" decorative />
      <span className="avatar-choice__name">{avatar.name}</span>
      {taken && <span className="visually-hidden">（已被選走）</span>}
    </button>
  )
}
