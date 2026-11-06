// Run: node --env-file=.env.local scripts/realtime-delete-check.ts (Node 22.18+).
// Checks that a trip member receives INSERT, UPDATE and DELETE through the same
// subscription shape the app uses (filtered INSERT/UPDATE, unfiltered DELETE). Creates two anonymous users.
import { createClient } from '@supabase/supabase-js'
import { signInOwner } from './owner.ts'
import assert from 'node:assert/strict'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const [a, b] = [createClient(url, key, opts), createClient(url, key, opts)]
const seen: string[] = []
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

try {
  await a.realtime.setAuth(await signInOwner(a))
  const anon = await b.auth.signInAnonymously()
  if (anon.error) throw anon.error
  await b.realtime.setAuth(anon.data.session!.access_token)
  const created = await a.rpc('create_trip', {
    name: 'Delete check',
    default_currency: 'JPY',
    member_name: 'A',
    avatar_id: 'bear',
  })
  if (created.error) throw created.error
  const trip = created.data as { trip_id: string; share_token: string; member_id: string }
  const joined = await b.rpc('join_trip', { share_token: trip.share_token })
  if (joined.error) throw joined.error

  await new Promise<void>((resolve, reject) => {
    const channel = b.channel('delete-check')
    // Mirrors src/features/trip/useTripRealtime.ts: filtered INSERT/UPDATE, unfiltered DELETE.
    for (const table of ['expenses', 'settlements']) {
      for (const event of ['INSERT', 'UPDATE'] as const) {
        channel.on(
          'postgres_changes',
          { event, schema: 'public', table, filter: `trip_id=eq.${trip.trip_id}` },
          (p) => seen.push(`${table}:${p.eventType}`),
        )
      }
      channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) =>
        seen.push(`${table}:${p.eventType}`),
      )
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status))
    })
  })
  await wait(1000)

  const base = {
    trip_id: trip.trip_id,
    member_id: trip.member_id,
    paid_by: trip.member_id,
    currency: 'JPY',
    spent_on: '2026-11-03',
    split_member_ids: [trip.member_id],
  }
  const ins = await a.rpc('upsert_expense', { payload: { ...base, title: 'x', amount: 100 } })
  if (ins.error) throw ins.error
  await wait(800)
  const upd = await a.rpc('upsert_expense', {
    payload: { ...base, id: ins.data, title: 'y', amount: 200 },
  })
  if (upd.error) throw upd.error
  await wait(800)
  const del = await a.rpc('delete_expense', { expense_id: ins.data })
  if (del.error) throw del.error
  await wait(800)
  const s = await a
    .from('settlements')
    .insert({
      trip_id: trip.trip_id,
      from_member: trip.member_id,
      to_member: trip.member_id,
      amount: 1,
      currency: 'JPY',
      created_by: trip.member_id,
    })
    .select('id')
  // from == to is rejected by a check constraint; use it only to prove nothing leaks. Expect error.
  assert(s.error, 'self-settlement should be rejected')
  await wait(2000)

  console.log('events received by B:', seen.join(', ') || '(none)')
  for (const e of ['expenses:INSERT', 'expenses:UPDATE', 'expenses:DELETE']) {
    console.log(`${seen.includes(e) ? 'PASS' : 'FAIL'}: ${e}`)
  }
} finally {
  await a.removeAllChannels()
  await b.removeAllChannels()
}
