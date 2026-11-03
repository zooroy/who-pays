import { splitEvenly, type CurrencyCode } from './money'

/**
 * Pure settlement logic (design.md §5). Nothing here is persisted: balances and
 * transfer suggestions are recomputed from expenses and settlements every time.
 */

export interface SettleExpense {
  amount: number
  currency: CurrencyCode
  paidBy: string
  splitAmong: readonly string[]
}

export interface SettleRecord {
  from: string
  to: string
  amount: number
  currency: CurrencyCode
}

export interface Transfer {
  from: string
  to: string
  amount: number
}

export type NetByMember = Map<string, number>
export type BalancesByCurrency = Map<CurrencyCode, NetByMember>

/**
 * Net amount per member, per currency. Positive = should receive, negative = owes.
 * `memberOrder` (members sorted by join time) decides who absorbs rounding
 * remainders, so the same data always produces the same shares.
 */
export function balances(
  memberOrder: readonly string[],
  expenses: readonly SettleExpense[],
  settlements: readonly SettleRecord[],
): BalancesByCurrency {
  const rank = new Map(memberOrder.map((id, index) => [id, index]))
  const byCurrency: BalancesByCurrency = new Map()

  const netFor = (currency: CurrencyCode) => {
    let net = byCurrency.get(currency)
    if (!net) {
      net = new Map(memberOrder.map((id) => [id, 0]))
      byCurrency.set(currency, net)
    }
    return net
  }
  const add = (net: NetByMember, id: string, delta: number) =>
    net.set(id, (net.get(id) ?? 0) + delta)

  for (const expense of expenses) {
    const net = netFor(expense.currency)
    add(net, expense.paidBy, expense.amount)
    const splitters = [...expense.splitAmong].sort(
      (a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity),
    )
    for (const [id, share] of splitEvenly(expense.amount, splitters)) add(net, id, -share)
  }

  for (const record of settlements) {
    const net = netFor(record.currency)
    add(net, record.from, record.amount)
    add(net, record.to, -record.amount)
  }

  return byCurrency
}

/**
 * Greedy settlement: repeatedly let the biggest debtor pay the biggest creditor.
 * Produces at most n-1 transfers and zeroes every balance. Ties are broken by
 * member order so the suggestion list is stable between renders.
 */
export function suggestTransfers(
  net: NetByMember,
  memberOrder: readonly string[] = [...net.keys()],
): Transfer[] {
  const rank = new Map(memberOrder.map((id, index) => [id, index]))
  const byRank = (a: string, b: string) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity)

  const creditors = [...net].filter(([, v]) => v > 0).map(([id, v]) => ({ id, left: v }))
  const debtors = [...net].filter(([, v]) => v < 0).map(([id, v]) => ({ id, left: -v }))
  const transfers: Transfer[] = []

  const pickLargest = (list: { id: string; left: number }[]) =>
    list.filter((p) => p.left > 0).sort((a, b) => b.left - a.left || byRank(a.id, b.id))[0]

  for (;;) {
    const debtor = pickLargest(debtors)
    const creditor = pickLargest(creditors)
    if (!debtor || !creditor) break
    const amount = Math.min(debtor.left, creditor.left)
    transfers.push({ from: debtor.id, to: creditor.id, amount })
    debtor.left -= amount
    creditor.left -= amount
  }

  return transfers
}

/** Total spending per currency. Settlements are repayments, not spending. */
export function totalSpending(expenses: readonly SettleExpense[]): Map<CurrencyCode, number> {
  const totals = new Map<CurrencyCode, number>()
  for (const e of expenses) totals.set(e.currency, (totals.get(e.currency) ?? 0) + e.amount)
  return totals
}

/** True when the trip has at least one expense and every balance in every currency is zero. */
export function isAllSettled(expenseCount: number, byCurrency: BalancesByCurrency): boolean {
  if (expenseCount === 0) return false
  for (const net of byCurrency.values()) {
    for (const value of net.values()) if (value !== 0) return false
  }
  return true
}
