// Only the owner can create trips (owner-account design §1), so check scripts sign
// the trip creator in as the owner. Set OWNER_EMAIL and OWNER_PASSWORD in the env file.
import type { SupabaseClient } from '@supabase/supabase-js'

export async function signInOwner(client: SupabaseClient): Promise<string> {
  const email = process.env.OWNER_EMAIL
  const password = process.env.OWNER_PASSWORD
  if (!email || !password) throw new Error('Set OWNER_EMAIL and OWNER_PASSWORD (see README)')
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.session.access_token
}
