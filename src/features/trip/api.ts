import { supabase } from '../../lib/supabase'
import { isAvatarId, type AvatarId } from '../../lib/avatars'
import { isCurrencyCode, type CurrencyCode } from '../../lib/money'

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
