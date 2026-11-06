import { useQuery } from '@tanstack/react-query'
import { ensureSession, supabase } from '../../lib/supabase'
import { pendingMigrations } from '../../lib/identity'
import { getMyAccess, isOwner, migrateLocalIdentities, setMyMember } from '../trip/api'

export interface Account {
  /** Signed in with email and password (not an anonymous friend). */
  signedIn: boolean
  isOwner: boolean
}
export const accountKey = ['account'] as const
export async function getAccount(): Promise<Account> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const user = data.session?.user
  if (!user || user.is_anonymous) return { signedIn: false, isOwner: false }
  return { signedIn: true, isOwner: await isOwner() }
}
export function useAccount() {
  return useQuery({ queryKey: accountKey, queryFn: getAccount, staleTime: Infinity })
}

/**
 * Signs the owner in (owner-account design §8). The identities this browser had as
 * an anonymous user are carried over to the account for trips where it has none yet,
 * so the owner keeps being "Roy" after the first sign-in.
 */
export async function signIn(email: string, password: string): Promise<void> {
  const before = await getMyAccess().catch(() => [])
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  const carried = before.flatMap((r) =>
    r.member_id ? [{ tripId: r.trip_id, memberId: r.member_id }] : [],
  )
  if (carried.length > 0) {
    const pending = pendingMigrations(carried, await getMyAccess().catch(() => []))
    await Promise.allSettled(pending.map((p) => setMyMember(p.tripId, p.memberId)))
  }
  await migrateLocalIdentities().catch(() => undefined)
}

/** Signs out on this device only, then starts a fresh anonymous session. */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) throw error
  await ensureSession()
}

export function signInError(error: unknown): string {
  const wrong =
    typeof error === 'object' &&
    error !== null &&
    (('code' in error && error.code === 'invalid_credentials') ||
      ('status' in error && error.status === 400))
  return wrong ? 'email 或密碼不正確。' : '無法登入，請確認網路後再試一次。'
}
