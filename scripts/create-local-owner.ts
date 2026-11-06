// Run: node --env-file=.env.local scripts/create-local-owner.ts
// Creates the owner account on the LOCAL Supabase and registers it in app_owners.
// Needs OWNER_EMAIL, OWNER_PASSWORD and the local SERVICE_ROLE_KEY (from
// `supabase status -o env`, passed on the command line, never in a VITE_ variable).
// Production owners are created in the Dashboard instead (README「部署」).
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SERVICE_ROLE_KEY
const email = process.env.OWNER_EMAIL
const password = process.env.OWNER_PASSWORD
if (!url || !serviceKey || !email || !password)
  throw new Error('Set VITE_SUPABASE_URL, SERVICE_ROLE_KEY, OWNER_EMAIL and OWNER_PASSWORD')
const host = new URL(url).hostname
if (host !== '127.0.0.1' && host !== 'localhost') throw new Error('Local Supabase only')

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
let userId = created.data.user?.id
if (created.error) {
  // Already created by an earlier run: look it up instead.
  const list = await admin.auth.admin.listUsers()
  if (list.error) throw list.error
  userId = list.data.users.find((u) => u.email === email)?.id
  if (!userId) throw created.error
}
const owner = await admin.from('app_owners').upsert({ user_id: userId })
if (owner.error) throw owner.error
console.log(`owner ready: ${email}`)
