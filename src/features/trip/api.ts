import { supabase } from '../../lib/supabase'
import { isAvatarId, type AvatarId } from '../../lib/avatars'
import { isCurrencyCode, type CurrencyCode } from '../../lib/money'
import { pendingMigrations, readLocalIdentities, type RemoteIdentity } from '../../lib/identity'

export interface Member {
  id: string
  name: string
  avatar_id: AvatarId
}
export interface Trip {
  id: string
  name: string
  share_token: string
  default_currency: CurrencyCode
}
export const tripKey = (id: string) => ['trip', id] as const
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
export async function joinTrip(shareToken: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_trip', { share_token: shareToken })
  if (error) throw error
  if (typeof data !== 'string') throw new Error('Invalid trip id')
  return data
}
export async function getTrip(id: string): Promise<Trip> {
  const { data, error } = await supabase
    .from('trips')
    .select('id,name,share_token,default_currency')
    .eq('id', id)
    .single()
  if (error) throw error
  if (
    !record(data) ||
    typeof data.id !== 'string' ||
    typeof data.name !== 'string' ||
    typeof data.share_token !== 'string' ||
    !isCurrencyCode(data.default_currency)
  )
    throw new Error('Invalid trip')
  return {
    id: data.id,
    name: data.name,
    share_token: data.share_token,
    default_currency: data.default_currency,
  }
}
export async function getMembers(id: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('members')
    .select('id,name,avatar_id')
    .eq('trip_id', id)
    .order('created_at')
    .order('id')
  if (error) throw error
  return data.map((row: unknown) => {
    if (
      !record(row) ||
      typeof row.id !== 'string' ||
      typeof row.name !== 'string' ||
      !isAvatarId(row.avatar_id)
    )
      throw new Error('Invalid member')
    return { id: row.id, name: row.name, avatar_id: row.avatar_id }
  })
}
export async function createTrip(
  name: string,
  currency: CurrencyCode,
  memberName: string,
  avatar: AvatarId,
) {
  const { data, error } = await supabase.rpc('create_trip', {
    name,
    default_currency: currency,
    member_name: memberName,
    avatar_id: avatar,
  })
  if (error) throw error
  if (
    !record(data) ||
    typeof data.trip_id !== 'string' ||
    typeof data.member_id !== 'string' ||
    typeof data.share_token !== 'string'
  )
    throw new Error('Invalid created trip')
  return { tripId: data.trip_id, memberId: data.member_id, shareToken: data.share_token }
}
export async function addMember(tripId: string, name: string, avatar: AvatarId): Promise<string> {
  const { data, error } = await supabase.rpc('add_member', {
    trip_id: tripId,
    name,
    avatar_id: avatar,
  })
  if (error) throw error
  if (typeof data !== 'string') throw new Error('Invalid member id')
  return data
}
export async function updateMember(
  memberId: string,
  name: string,
  avatar: AvatarId,
): Promise<void> {
  const { error } = await supabase.rpc('update_member', {
    member_id: memberId,
    name,
    avatar_id: avatar,
  })
  if (error) throw error
}
export interface MyTrip extends Trip {
  members: { id: string; avatar_id: AvatarId }[]
  /** Who this user is in the trip, if chosen. */
  my_member_id: string | null
}
/** Trips this user can open: all of them for the owner, joined ones for friends (RLS). */
export async function getMyTrips(): Promise<MyTrip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('id,name,share_token,default_currency,members(id,avatar_id),trip_access(member_id)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((row: unknown) => {
    if (
      !record(row) ||
      typeof row.id !== 'string' ||
      typeof row.name !== 'string' ||
      typeof row.share_token !== 'string' ||
      !isCurrencyCode(row.default_currency) ||
      !Array.isArray(row.members) ||
      !Array.isArray(row.trip_access)
    )
      throw new Error('Invalid trip')
    const members = row.members.map((m: unknown) => {
      if (!record(m) || typeof m.id !== 'string' || !isAvatarId(m.avatar_id))
        throw new Error('Invalid member')
      return { id: m.id, avatar_id: m.avatar_id }
    })
    // RLS returns only this user's own access row.
    const access: unknown = row.trip_access[0]
    const mine = record(access) && typeof access.member_id === 'string' ? access.member_id : null
    return {
      id: row.id,
      name: row.name,
      share_token: row.share_token,
      default_currency: row.default_currency,
      members,
      my_member_id: mine,
    }
  })
}

export async function isOwner(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_owner')
  if (error) throw error
  return data === true
}

/** This user's access rows (RLS returns only their own). */
export async function getMyAccess(): Promise<RemoteIdentity[]> {
  const { data, error } = await supabase.from('trip_access').select('trip_id,member_id')
  if (error) throw error
  return data.map((row: unknown) => {
    if (
      !record(row) ||
      typeof row.trip_id !== 'string' ||
      !(typeof row.member_id === 'string' || row.member_id === null)
    )
      throw new Error('Invalid access row')
    return { trip_id: row.trip_id, member_id: row.member_id }
  })
}
export const meKey = (tripId: string) => [...tripKey(tripId), 'me'] as const
export async function getMyMember(tripId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('trip_access')
    .select('member_id')
    .eq('trip_id', tripId)
    .maybeSingle()
  if (error) throw error
  return record(data) && typeof data.member_id === 'string' ? data.member_id : null
}
export async function setMyMember(tripId: string, memberId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_my_member', { trip_id: tripId, member_id: memberId })
  if (error) throw error
}

/**
 * Moves identities kept in localStorage by older versions into the database
 * (design §3). A key is removed once it is stored, or once the database rejects it
 * (for example the member was deleted); network failures keep it for next time.
 */
export async function migrateLocalIdentities(): Promise<void> {
  const local = readLocalIdentities(localStorage)
  if (local.length === 0) return
  const pending = pendingMigrations(local, await getMyAccess())
  const pendingKeys = new Set(pending.map((p) => p.key))
  for (const l of local) if (!pendingKeys.has(l.key)) localStorage.removeItem(l.key)
  for (const p of pending) {
    try {
      await setMyMember(p.tripId, p.memberId)
      localStorage.removeItem(p.key)
    } catch (err) {
      if (record(err) && typeof err.code === 'string' && err.code !== '')
        localStorage.removeItem(p.key)
    }
  }
}

export async function deleteMember(memberId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_member', { member_id: memberId })
  if (error) throw error
}
export async function resetShareToken(tripId: string): Promise<string> {
  const { data, error } = await supabase.rpc('reset_share_token', { trip_id: tripId })
  if (error) throw error
  if (typeof data !== 'string') throw new Error('Invalid share token')
  return data
}
/** Removes the trip's receipt photos first; if that fails, the trip is left intact (design §5). */
export async function deleteTrip(tripId: string): Promise<void> {
  const bucket = supabase.storage.from('receipts')
  for (;;) {
    const { data, error } = await bucket.list(tripId, { limit: 100 })
    if (error) throw error
    if (data.length === 0) break
    const removed = await bucket.remove(data.map((f) => `${tripId}/${f.name}`))
    if (removed.error) throw removed.error
    // Nothing removed means the photos cannot be deleted; stop instead of looping.
    if (removed.data.length === 0) throw new Error('Receipt photos were not removed')
  }
  const { error } = await supabase.rpc('delete_trip', { trip_id: tripId })
  if (error) throw error
}
