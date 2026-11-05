/**
 * The 16-avatar library (trip-membership spec: 頭像庫). Ids must match the
 * whitelist in the members.avatar_id check constraint.
 *
 * `tint` is each mascot's solid background. The same values are the palette
 * input for ip-as-logo-skill (task 4.2), so generated art and placeholders match.
 * Until the art exists, the Avatar component draws the first character of `name`
 * on the tint.
 */

export const AVATAR_IDS = [
  'bear',
  'cat',
  'penguin',
  'fox',
  'rabbit',
  'dog',
  'panda',
  'koala',
  'owl',
  'frog',
  'tiger',
  'otter',
  'hamster',
  'deer',
  'seal',
  'duck',
] as const

export type AvatarId = (typeof AVATAR_IDS)[number]

export interface AvatarInfo {
  id: AvatarId
  name: string
  /** Placeholder glyph until the art exists; unique across the library. */
  glyph: string
  tint: string
  image?: string
}

const INFO: Record<AvatarId, Omit<AvatarInfo, 'id' | 'image' | 'glyph'> & { glyph?: string }> = {
  bear: { name: '熊', tint: '#e8c9a8' },
  cat: { name: '貓', tint: '#f2d27a' },
  penguin: { name: '企鵝', tint: '#a9cbe0' },
  fox: { name: '狐狸', tint: '#f0b48a' },
  rabbit: { name: '兔子', tint: '#f3c4cf' },
  dog: { name: '狗', tint: '#d9c39a' },
  panda: { name: '熊貓', glyph: '熊貓', tint: '#c9d6cf' },
  koala: { name: '無尾熊', tint: '#c3c6d8' },
  owl: { name: '貓頭鷹', glyph: '梟', tint: '#d4b99a' },
  frog: { name: '青蛙', tint: '#b9dba0' },
  tiger: { name: '老虎', tint: '#f4c070' },
  otter: { name: '水獺', tint: '#cdb3a0' },
  hamster: { name: '倉鼠', tint: '#f5d9b0' },
  deer: { name: '鹿', tint: '#dcb98f' },
  seal: { name: '海豹', tint: '#b8d3d8' },
  duck: { name: '鴨子', tint: '#f6e08f' },
}

// Generated art (task 4.2) is picked up automatically from src/assets/avatars/<id>.webp.
const images = import.meta.glob<string>('../assets/avatars/*.webp', {
  eager: true,
  import: 'default',
})

export const AVATARS: Record<AvatarId, AvatarInfo> = Object.fromEntries(
  AVATAR_IDS.map((id) => [
    id,
    {
      id,
      ...INFO[id],
      glyph: INFO[id].glyph ?? INFO[id].name.slice(0, 1),
      image: images[`../assets/avatars/${id}.webp`],
    },
  ]),
) as Record<AvatarId, AvatarInfo>

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && (AVATAR_IDS as readonly string[]).includes(value)
}

/** A member name is optional: left blank, the member is called by their avatar (熊, 貓…). */
export function memberName(name: string, avatar: AvatarId): string {
  return name.trim() || AVATARS[avatar].name
}
