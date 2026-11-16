import { createClient } from '@supabase/supabase-js'
import { E2E_OWNER } from './fixtures/owner'
import { localSupabase } from './localSupabase'

/** Creates (or reuses) the E2E owner and registers it in app_owners, like scripts/create-local-owner.ts. */
export default async function globalSetup() {
  const { url, serviceRoleKey } = localSupabase()
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

  const created = await admin.auth.admin.createUser({
    email: E2E_OWNER.email,
    password: E2E_OWNER.password,
    email_confirm: true,
  })
  let userId = created.data.user?.id
  if (created.error) {
    // Already created by an earlier run.
    const list = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (list.error) throw list.error
    userId = list.data.users.find((u) => u.email === E2E_OWNER.email)?.id
    if (!userId) throw created.error
  }
  const owner = await admin.from('app_owners').upsert({ user_id: userId })
  if (owner.error) throw owner.error
}
