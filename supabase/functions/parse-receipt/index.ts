// parse-receipt: reads a receipt photo the caller uploaded to their trip folder
// and returns a ReceiptResult from Gemini (design.md §7). The Gemini key lives
// only in this function's environment and never reaches the browser.
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  ERROR_STATUS,
  RECEIPT_PROMPT,
  RECEIPT_SCHEMA,
  extractResult,
  parseRequest,
  upstreamError,
  type ReceiptErrorCode,
} from './receipt.ts'

const TIMEOUT_MS = 25_000
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
function fail(code: ReceiptErrorCode) {
  return json({ code }, ERROR_STATUS[code])
}

function toBase64(bytes: Uint8Array) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail('BAD_REQUEST')

  const authorization = req.headers.get('Authorization')
  if (!authorization) return fail('UNAUTHORIZED')
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } },
  )
  const { data: user, error: userError } = await supabase.auth.getUser(
    authorization.replace(/^Bearer\s+/i, ''),
  )
  if (userError || !user.user) return fail('UNAUTHORIZED')

  const request = parseRequest(await req.json().catch(() => null))
  if (!request) return fail('BAD_REQUEST')

  // Both reads run as the caller, so RLS decides: no trip_access, no rows, no photo.
  const { data: trip } = await supabase
    .from('trips')
    .select('id')
    .eq('id', request.tripId)
    .maybeSingle()
  if (!trip) return fail('FORBIDDEN')
  const { data: photo, error: photoError } = await supabase.storage
    .from('receipts')
    .download(request.path)
  if (photoError || !photo) return fail('FORBIDDEN')

  const key = Deno.env.get('GEMINI_API_KEY')
  const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash'
  if (!key) {
    console.error('parse-receipt: GEMINI_API_KEY is not set')
    return fail('UPSTREAM_ERROR')
  }

  let response: Response
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: RECEIPT_PROMPT },
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: toBase64(new Uint8Array(await photo.arrayBuffer())),
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: RECEIPT_SCHEMA,
            temperature: 0,
          },
        }),
      },
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') return fail('TIMEOUT')
    console.error('parse-receipt: Gemini request failed', error)
    return fail('UPSTREAM_ERROR')
  }
  if (!response.ok) {
    // Log the status and Google's message only; never the request (it carries the key header).
    console.error('parse-receipt: Gemini', response.status, (await response.text()).slice(0, 500))
    return fail(upstreamError(response.status))
  }
  const result = extractResult(await response.json().catch(() => null))
  if (!result) return fail('UPSTREAM_ERROR')
  if (!result.is_receipt) return fail('NOT_A_RECEIPT')
  return json(result)
})
