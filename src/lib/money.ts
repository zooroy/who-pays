/**
 * Amounts are always integers in the currency's minor unit (see design.md §4).
 * For JPY and TWD the exponent is 0, so the minor unit is the whole yen / dollar.
 */

export type CurrencyCode = 'TWD' | 'JPY'

export interface Currency {
  code: CurrencyCode
  symbol: string
  exponent: number
  label: string
}

export const CURRENCIES: Record<CurrencyCode, Currency> = {
  TWD: { code: 'TWD', symbol: 'NT$', exponent: 0, label: '新台幣' },
  JPY: { code: 'JPY', symbol: '¥', exponent: 0, label: '日圓' },
}

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[]

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && value in CURRENCIES
}

/** Format a minor-unit amount, e.g. formatMoney(3240, 'JPY') === '¥3,240'. */
export function formatMoney(amount: number, currency: CurrencyCode): string {
  const { symbol, exponent } = CURRENCIES[currency]
  const sign = amount < 0 ? '-' : ''
  const major = Math.abs(amount) / 10 ** exponent
  const digits = major.toLocaleString('en-US', {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  })
  return `${sign}${symbol}${digits}`
}

/** Parse user input in major units into a minor-unit integer, or null if invalid. */
export function parseMoneyInput(input: string, currency: CurrencyCode): number | null {
  const cleaned = input.replace(/[,\s]/g, '')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  const { exponent } = CURRENCIES[currency]
  const [whole, frac = ''] = cleaned.split('.')
  if (frac.length > exponent) return null
  return Number(whole) * 10 ** exponent + Number(frac.padEnd(exponent, '0') || 0)
}

/**
 * Split `amount` evenly between `ids`, in the given order. The remainder is
 * handed out one minor unit at a time to the earliest ids, so the result is
 * deterministic and always sums to `amount`.
 */
export function splitEvenly<T extends string>(amount: number, ids: readonly T[]): Map<T, number> {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`amount must be a non-negative integer, got ${amount}`)
  }
  if (ids.length === 0) throw new Error('cannot split between zero people')
  const base = Math.floor(amount / ids.length)
  const remainder = amount - base * ids.length
  const shares = new Map<T, number>()
  ids.forEach((id, index) => shares.set(id, base + (index < remainder ? 1 : 0)))
  return shares
}
