import {
  CURRENCIES,
  formatMoney,
  isCurrencyCode,
  parseMoneyInput,
  type CurrencyCode,
} from '../../lib/money'

/** What parse-receipt returns (design.md §7). Stored as-is in expenses.receipt_raw. */
export interface ReceiptItem {
  name: string
  name_zh: string
  qty: number
  unit_price: number | null
  amount: number
}
export interface ReceiptResult {
  store_name: string | null
  date: string | null
  time: string | null
  currency: string
  items: ReceiptItem[]
  subtotal: number | null
  tax: number | null
  service_charge: number | null
  discount: number | null
  total: number | null
  invoice_number: string | null
  confidence: 'high' | 'medium' | 'low'
  is_receipt: boolean
  notes: string | null
}

const nullable = (v: unknown, type: 'string' | 'number') => v === null || typeof v === type

function isItem(v: unknown): v is ReceiptItem {
  if (typeof v !== 'object' || v === null) return false
  const i = v as Record<string, unknown>
  return (
    typeof i.name === 'string' &&
    typeof i.name_zh === 'string' &&
    typeof i.qty === 'number' &&
    nullable(i.unit_price, 'number') &&
    typeof i.amount === 'number'
  )
}

export function isReceiptResult(v: unknown): v is ReceiptResult {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    nullable(r.store_name, 'string') &&
    nullable(r.date, 'string') &&
    nullable(r.time, 'string') &&
    typeof r.currency === 'string' &&
    Array.isArray(r.items) &&
    r.items.every(isItem) &&
    ['subtotal', 'tax', 'service_charge', 'discount', 'total'].every((k) =>
      nullable(r[k], 'number'),
    ) &&
    nullable(r.invoice_number, 'string') &&
    (r.confidence === 'high' || r.confidence === 'medium' || r.confidence === 'low') &&
    typeof r.is_receipt === 'boolean'
  )
}

/** An item row on the confirm screen; amounts stay as typed text until saved. */
export interface ItemDraft {
  key: string
  name: string
  nameZh: string
  qty: number
  unitPrice: number | null
  amount: string
}

export function itemDrafts(result: ReceiptResult): ItemDraft[] {
  return result.items.map((item, index) => ({
    key: String(index),
    name: item.name,
    nameZh: item.name_zh,
    qty: item.qty,
    unitPrice: item.unit_price,
    amount: String(item.amount),
  }))
}

/** Prefill for the expense form. Amounts on JPY/TWD receipts are already minor units. */
export function receiptPrefill(result: ReceiptResult, fallbackCurrency: CurrencyCode) {
  const currency = isCurrencyCode(result.currency) ? result.currency : fallbackCurrency
  const valid = (d: string | null) =>
    d !== null && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d))
  return {
    title: result.store_name?.trim() ?? '',
    amount: result.total === null ? '' : String(result.total / 10 ** CURRENCIES[currency].exponent),
    currency,
    spentOn: valid(result.date) ? result.date : null,
    unsupportedCurrency: isCurrencyCode(result.currency) ? null : result.currency,
  }
}

/**
 * design.md §7: sum(items) + tax + service − discount should equal the total.
 * Returns the gap as a formatted amount, or null when it adds up (or cannot be checked).
 */
export function totalMismatch(
  itemAmounts: readonly (number | null)[],
  result: Pick<ReceiptResult, 'tax' | 'service_charge' | 'discount'>,
  total: number | null,
  currency: CurrencyCode,
): string | null {
  if (total === null || itemAmounts.length === 0 || itemAmounts.some((a) => a === null)) return null
  const sum =
    itemAmounts.reduce<number>((s, a) => s + (a ?? 0), 0) +
    (result.tax ?? 0) +
    (result.service_charge ?? 0) -
    (result.discount ?? 0)
  return sum === total ? null : formatMoney(Math.abs(total - sum), currency)
}

export type ScanFailure =
  | 'QUOTA_EXCEEDED'
  | 'NOT_A_RECEIPT'
  | 'TIMEOUT'
  | 'MODEL_BUSY'
  | 'UPSTREAM_ERROR'
  | 'NETWORK'
  | 'FORBIDDEN'

export function scanFailureMessage(code: ScanFailure): string {
  switch (code) {
    case 'QUOTA_EXCEEDED':
      return '今天的自動辨識額度已用完，請手動輸入。'
    case 'NOT_A_RECEIPT':
      return '這張照片無法辨識成收據，請手動輸入。'
    case 'TIMEOUT':
      return '辨識花太久時間了，請手動輸入。'
    case 'MODEL_BUSY':
      return '自動辨識現在太忙，請稍後再試或手動輸入。'
    case 'NETWORK':
      return '網路連線不穩，無法辨識收據，請手動輸入。'
    case 'FORBIDDEN':
      return '無法讀取這張照片，請手動輸入。'
    default:
      return '自動辨識暫時無法使用，請手動輸入。'
  }
}

/** Item amounts may be negative (discount lines); otherwise same rules as money input. */
export function parseItemAmount(input: string, currency: CurrencyCode): number | null {
  const trimmed = input.trim()
  const negative = trimmed.startsWith('-')
  const value = parseMoneyInput(negative ? trimmed.slice(1) : trimmed, currency)
  return value === null ? null : negative ? -value : value
}
