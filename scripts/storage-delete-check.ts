// Run: node --env-file=.env.local scripts/storage-delete-check.ts
import { createClient } from '@supabase/supabase-js'
import { signInOwner } from './owner.ts'
import assert from 'node:assert/strict'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
const clients = Array.from({ length: 2 }, () =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }),
)
const [a, c] = clients
try {
  await signInOwner(a)
  const anon = await c.auth.signInAnonymously()
  if (anon.error) throw anon.error
  const created = await a.rpc('create_trip', {
    name: 'Storage delete check',
    default_currency: 'JPY',
    member_name: 'A',
    avatar_id: 'bear',
  })
  if (created.error) throw created.error
  const trip: unknown = created.data
  assert(
    typeof trip === 'object' &&
      trip !== null &&
      'trip_id' in trip &&
      typeof trip.trip_id === 'string',
  )
  const path = `${trip.trip_id}/x.jpg`
  // A tiny JPEG fixture, used only to verify storage ownership and removal.
  const picture = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCYAAP/2Q==',
    'base64',
  )
  const upload = await a.storage
    .from('receipts')
    .upload(path, picture, { contentType: 'image/jpeg' })
  if (upload.error) throw upload.error
  const before = await a.storage.from('receipts').download(path)
  if (before.error) throw before.error
  assert(before.data.size > 0)
  console.log('PASS: A created a trip and uploaded receipts/<trip_id>/x.jpg.')
  await c.storage.from('receipts').remove([path])
  const afterStranger = await a.storage.from('receipts').download(path)
  if (afterStranger.error) throw afterStranger.error
  assert(afterStranger.data.size > 0, 'C must not remove A’s image')
  console.log('PASS: C called remove; A can still download the image.')
  const removed = await a.storage.from('receipts').remove([path])
  if (removed.error) throw removed.error
  const list = await a.storage.from('receipts').list(trip.trip_id)
  if (list.error) throw list.error
  assert(!list.data.some((file) => file.name === 'x.jpg'))
  // Not download(): hosted Storage serves it from a CDN cache for up to the
  // object's cache-control age. A signed URL is issued only for existing objects.
  const afterOwner = await a.storage.from('receipts').createSignedUrl(path, 60)
  assert(afterOwner.error, 'A’s image must be gone')
  console.log('PASS: A called remove; listing and signed URL confirm the image is gone.')
} finally {
  await Promise.all(
    clients.map(async (client) => {
      await client.removeAllChannels()
      await client.auth.signOut({ scope: 'local' })
    }),
  )
}
