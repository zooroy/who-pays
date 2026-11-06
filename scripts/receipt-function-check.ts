// Run: node --env-file=.env.local scripts/receipt-function-check.ts [photo.jpg]
// Requires `supabase functions serve`. Checks parse-receipt access control and,
// when a photo is given and GEMINI_API_KEY is set, prints the parsed result.
import { createClient } from '@supabase/supabase-js'
import { signInOwner } from './owner.ts'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const owner = createClient(url, key, options)
const stranger = createClient(url, key, options)
// A 1×1 white JPEG, enough for the access checks.
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
)
const photoPath = process.argv[2]

async function call(token: string | null, body: unknown) {
  const res = await fetch(`${url}/functions/v1/parse-receipt`, {
    method: 'POST',
    headers: {
      apikey: key!,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json().catch(() => null)) as unknown }
}

const ownerToken = await signInOwner(owner)
const b = await stranger.auth.signInAnonymously()
if (b.error) throw b.error
const created = await owner.rpc('create_trip', {
  name: 'Receipt check',
  default_currency: 'JPY',
  member_name: 'A',
  avatar_id: 'bear',
})
if (created.error) throw created.error
const tripId = (created.data as { trip_id: string }).trip_id
const path = `${tripId}/${crypto.randomUUID()}.jpg`
const upload = await owner.storage
  .from('receipts')
  .upload(path, photoPath ? await readFile(photoPath) : TINY_JPEG, { contentType: 'image/jpeg' })
if (upload.error) throw upload.error

const strangerToken = b.data.session!.access_token
const anon = await call(null, { trip_id: tripId, path })
assert.equal(anon.status, 401, `no token: ${JSON.stringify(anon)}`)
const forbidden = await call(strangerToken, { trip_id: tripId, path })
assert.deepEqual(forbidden, { status: 403, body: { code: 'FORBIDDEN' } })
const bad = await call(ownerToken, { trip_id: tripId, path: `${tripId}/../x.jpg` })
assert.deepEqual(bad, { status: 400, body: { code: 'BAD_REQUEST' } })
console.log('PASS: no token → 401, stranger → 403 FORBIDDEN, bad path → 400 BAD_REQUEST')

const own = await call(ownerToken, { trip_id: tripId, path })
console.log(`owner → ${own.status}`, JSON.stringify(own.body, null, 2))
await owner.storage.from('receipts').remove([path])
