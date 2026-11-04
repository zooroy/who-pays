// Pure pieces of parse-receipt: no Deno or network APIs, so Vitest can test them.

/** JSON Schema for Gemini structured output; mirrors ReceiptResult in design.md §7. */
const nullableNumber = { type: ['number', 'null'] }
const nullableString = { type: ['string', 'null'] }

export const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    store_name: nullableString,
    date: { ...nullableString, description: 'YYYY-MM-DD (Gregorian)' },
    time: { ...nullableString, description: 'HH:mm, 24-hour' },
    currency: { type: 'string', description: 'ISO 4217 code, e.g. JPY or TWD' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Exactly as printed' },
          name_zh: { type: 'string', description: 'Traditional Chinese (Taiwan)' },
          qty: { type: 'number' },
          unit_price: nullableNumber,
          amount: { type: 'number', description: 'Line total as printed' },
        },
        required: ['name', 'name_zh', 'qty', 'unit_price', 'amount'],
      },
    },
    subtotal: nullableNumber,
    tax: nullableNumber,
    service_charge: nullableNumber,
    discount: nullableNumber,
    total: nullableNumber,
    invoice_number: nullableString,
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    is_receipt: { type: 'boolean' },
    notes: nullableString,
  },
  required: [
    'store_name',
    'date',
    'time',
    'currency',
    'items',
    'subtotal',
    'tax',
    'service_charge',
    'discount',
    'total',
    'invoice_number',
    'confidence',
    'is_receipt',
    'notes',
  ],
} as const

export const RECEIPT_PROMPT = `You read one photo of a purchase receipt from a trip, usually in Japan or Taiwan, and extract it.

Rules:
- is_receipt: false when the photo is not a receipt or invoice. Then use null or empty values for everything else and confidence "low".
- store_name: the shop name as printed, in its original language.
- date: YYYY-MM-DD in the Gregorian calendar. Convert Japanese eras (令和8年 = 2026) and Taiwan ROC years (民國115年 or 115年 = 2026). time: HH:mm, 24-hour. Use null when not printed.
- currency: ISO 4217. 円 or ¥ on a Japanese receipt is JPY. NT$, 元 or a Taiwan 統一發票 is TWD.
- items: one entry per printed line item, in printed order. Never invent items that are not printed.
  - name: exactly as printed.
  - name_zh: a natural Traditional Chinese (Taiwan) translation, as a Taiwanese menu would say it (生ビール → 生啤酒). If name is already Chinese, copy it unchanged.
  - qty: the printed quantity, 1 when not shown. unit_price: the printed unit price, or null.
  - amount: the printed line total. A discount printed as its own line under the items is an item with a negative amount.
- tax: only tax added on top of the item prices (外税). When tax is already included in the prices (内税, 税込, or a Taiwan receipt), tax is 0.
- service_charge: a printed service charge (サービス料, 服務費), otherwise 0.
- discount: only a whole-bill discount that is not already an item line, as a positive number, otherwise 0.
- total: the amount actually paid (合計, お会計, 總計). Not the cash handed over (お預り) and not the change (お釣り).
- All amounts are plain numbers in the receipt's normal units (yen, NT dollars), with no separators or symbols.
- invoice_number: the Taiwan 統一發票 number without the dash (AB-12345678 → AB12345678), otherwise null.
- confidence: "high" when every field is clearly readable, "medium" when some fields are guessed, "low" when the photo is blurry, cut off, or the total is unclear.
- notes: one short sentence in Traditional Chinese about anything uncertain, otherwise null.`

export type ReceiptErrorCode =
  | 'UNAUTHORIZED'
  | 'BAD_REQUEST'
  | 'FORBIDDEN'
  | 'QUOTA_EXCEEDED'
  | 'NOT_A_RECEIPT'
  | 'TIMEOUT'
  | 'UPSTREAM_ERROR'

export const ERROR_STATUS: Record<ReceiptErrorCode, number> = {
  UNAUTHORIZED: 401,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  QUOTA_EXCEEDED: 429,
  NOT_A_RECEIPT: 422,
  TIMEOUT: 504,
  UPSTREAM_ERROR: 502,
}

/**
 * Maps a Gemini HTTP status to our error code (design.md §7). 429 is the free-tier
 * rate limit; 402 is a billed project whose prepaid credits ran out.
 */
export function upstreamError(status: number): ReceiptErrorCode {
  return status === 429 || status === 402 ? 'QUOTA_EXCEEDED' : 'UPSTREAM_ERROR'
}

/** Gemini overload or internal errors are usually momentary; worth one retry. */
export function isRetryable(status: number): boolean {
  return status === 503 || status === 500
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** Only `<trip_id>/<uuid>.jpg` inside the caller's own trip folder is accepted. */
export function parseRequest(body: unknown): { tripId: string; path: string } | null {
  if (typeof body !== 'object' || body === null) return null
  const { trip_id: tripId, path } = body as Record<string, unknown>
  if (typeof tripId !== 'string' || typeof path !== 'string') return null
  if (!new RegExp(`^${UUID}$`, 'i').test(tripId)) return null
  if (!new RegExp(`^${tripId}/${UUID}\\.jpg$`, 'i').test(path)) return null
  return { tripId, path }
}

/** Pulls the structured JSON out of a generateContent response. */
export function extractResult(response: unknown): Record<string, unknown> | null {
  const text = (response as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] })
    ?.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === 'string')?.text
  if (typeof text !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const result = parsed as Record<string, unknown>
    return typeof result.is_receipt === 'boolean' ? result : null
  } catch {
    return null
  }
}
