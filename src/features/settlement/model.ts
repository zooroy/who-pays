import { CURRENCY_CODES, type CurrencyCode } from '../../lib/money'
import {
  balances,
  isAllSettled,
  suggestTransfers,
  totalSpending,
  type SettleRecord,
  type Transfer,
} from '../../lib/settle'
import type { Expense } from '../expense/model'

export interface Settlement {
  id: string
  from_member: string
  to_member: string
  amount: number
  currency: CurrencyCode
  created_at: string
}

export interface SettleView {
  /** The current member's net per currency: positive = gets back, negative = pays. */
  mine: { currency: CurrencyCode; net: number }[]
  /** Only currencies that still need transfers. */
  transfers: { currency: CurrencyCode; transfers: Transfer[] }[]
  totals: { currency: CurrencyCode; amount: number }[]
  allSettled: boolean
}

export function toSettleRecord(s: Settlement): SettleRecord {
  return { from: s.from_member, to: s.to_member, amount: s.amount, currency: s.currency }
}

/**
 * Everything the settle screen shows, recomputed from raw rows (design.md §5).
 * `memberOrder` is members by join time; currencies follow CURRENCY_CODES so the
 * sections never reorder between renders.
 */
export function settleView(
  memberOrder: readonly string[],
  expenses: readonly Expense[],
  settlements: readonly Settlement[],
  meId: string,
): SettleView {
  const rows = expenses.map((e) => ({
    amount: e.amount,
    currency: e.currency,
    paidBy: e.paid_by,
    splitAmong: e.expense_splits.map((s) => s.member_id),
  }))
  const byCurrency = balances(memberOrder, rows, settlements.map(toSettleRecord))
  const totals = totalSpending(rows)
  const used = CURRENCY_CODES.filter((c) => byCurrency.has(c))
  return {
    mine: used.map((currency) => ({ currency, net: byCurrency.get(currency)?.get(meId) ?? 0 })),
    transfers: used
      .map((currency) => ({
        currency,
        transfers: suggestTransfers(byCurrency.get(currency) ?? new Map(), memberOrder),
      }))
      .filter((section) => section.transfers.length > 0),
    totals: CURRENCY_CODES.filter((c) => totals.has(c)).map((currency) => ({
      currency,
      amount: totals.get(currency) ?? 0,
    })),
    allSettled: isAllSettled(expenses.length, byCurrency),
  }
}

/** Identifies a suggested transfer across refetches (amounts may change, the pair does not). */
export function transferKey(currency: CurrencyCode, t: Pick<Transfer, 'from' | 'to'>): string {
  return `${currency}:${t.from}:${t.to}`
}
