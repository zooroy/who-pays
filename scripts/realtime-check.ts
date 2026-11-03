// Run: node --env-file=<local-env-file> scripts/realtime-check.ts (Node 22.18+).
// Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY; creates only three anonymous users.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
const clients = Array.from({ length: 3 }, () =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }),
)
const [a, b, c] = clients
let bEvents = 0
let cEvents = 0
let tripId: string
async function subscribe(client: SupabaseClient, label: string, onEvent: () => void) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: subscription timed out`)), 15000)
    client
      .channel(`check-${label}`)
      .on('system', {}, (message) => {
        if (message.extension === 'postgres_changes' && message.status === 'ok') {
          clearTimeout(timer)
          resolve()
        }
        if (message.status === 'error') {
          clearTimeout(timer)
          reject(new Error(`${label}: PostgreSQL subscription failed`))
        }
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'expenses', filter: `trip_id=eq.${tripId}` },
        onEvent,
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(timer)
          reject(new Error(`${label}: ${status}`))
        }
      })
  })
}
try {
  for (const client of clients) {
    const { data, error } = await client.auth.signInAnonymously()
    if (error) throw error
    assert(data.session)
    await client.realtime.setAuth(data.session.access_token)
  }
  const created = await a.rpc('create_trip', {
    name: 'Realtime check',
    default_currency: 'TWD',
    member_name: 'A',
    avatar_id: 'bear',
  })
  if (created.error) throw created.error
  const trip: unknown = created.data
  assert(
    typeof trip === 'object' &&
      trip !== null &&
      'trip_id' in trip &&
      typeof trip.trip_id === 'string' &&
      'share_token' in trip &&
      typeof trip.share_token === 'string' &&
      'member_id' in trip &&
      typeof trip.member_id === 'string',
  )
  tripId = trip.trip_id
  const joined = await b.rpc('join_trip', { share_token: trip.share_token })
  if (joined.error) throw joined.error
  await Promise.all([subscribe(b, 'B', () => bEvents++), subscribe(c, 'C', () => cEvents++)])
  const expense = await a.rpc('upsert_expense', {
    payload: {
      trip_id: tripId,
      member_id: trip.member_id,
      paid_by: trip.member_id,
      title: 'Realtime test',
      amount: 100,
      currency: 'TWD',
      spent_on: new Date().toISOString().slice(0, 10),
      split_member_ids: [trip.member_id],
      items: [],
    },
  })
  if (expense.error) throw expense.error
  await new Promise((resolve) => setTimeout(resolve, 5000))
  assert(bEvents > 0, 'B must receive the expense INSERT')
  assert.equal(cEvents, 0, 'C must not receive events within 5 seconds')
  console.log(
    `PASS: A inserted expense; B received ${bEvents} event(s); C received ${cEvents} events in 5 seconds.`,
  )
} finally {
  await Promise.all(
    clients.map(async (client) => {
      await client.removeAllChannels()
      await client.auth.signOut({ scope: 'local' })
    }),
  )
}
