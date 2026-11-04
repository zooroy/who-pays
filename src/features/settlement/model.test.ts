import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { Expense } from '../expense/model'
import { settleView, type Settlement } from './model'

const order = ['bear', 'cat', 'penguin']
let n = 0
function expense(amount: number, currency: CurrencyCode, paidBy: string, split = order): Expense {
  n += 1
  return {
    id: `e${n}`,
    title: 't',
    amount,
    currency,
    spent_on: '2026-11-03',
    paid_by: paidBy,
    updated_by: paidBy,
    created_at: '2026-11-03T00:00:00Z',
    receipt_path: null,
    receipt_raw: null,
    expense_splits: split.map((member_id) => ({ member_id })),
    expense_items: [],
  }
}
function paid(from: string, to: string, amount: number, currency: CurrencyCode): Settlement {
  n += 1
  return { id: `s${n}`, from_member: from, to_member: to, amount, currency, created_at: '' }
}

describe('settleView', () => {
  it('shows my net per currency and suggestions per currency without mixing', () => {
    const view = settleView(
      order,
      [expense(4200, 'JPY', 'bear', ['cat']), expense(500, 'TWD', 'cat', ['bear'])],
      [],
      'cat',
    )
    expect(view.mine).toEqual([
      { currency: 'TWD', net: 500 },
      { currency: 'JPY', net: -4200 },
    ])
    expect(view.transfers).toEqual([
      { currency: 'TWD', transfers: [{ from: 'bear', to: 'cat', amount: 500 }] },
      { currency: 'JPY', transfers: [{ from: 'cat', to: 'bear', amount: 4200 }] },
    ])
    expect(view.allSettled).toBe(false)
  })

  it('drops a suggestion once it is marked paid, and brings it back when the record is deleted', () => {
    const expenses = [expense(4200, 'JPY', 'bear', ['cat'])]
    const record = paid('cat', 'bear', 4200, 'JPY')
    const settled = settleView(order, expenses, [record], 'cat')
    expect(settled.transfers).toEqual([])
    expect(settled.allSettled).toBe(true)
    expect(settled.mine).toEqual([{ currency: 'JPY', net: 0 }])
    const undone = settleView(order, expenses, [], 'cat')
    expect(undone.transfers[0].transfers).toEqual([{ from: 'cat', to: 'bear', amount: 4200 }])
  })

  it('totals spending per currency, excluding repayments', () => {
    const view = settleView(
      order,
      [expense(128400, 'JPY', 'bear'), expense(42000, 'TWD', 'cat')],
      [paid('cat', 'bear', 1000, 'JPY')],
      'bear',
    )
    expect(view.totals).toEqual([
      { currency: 'TWD', amount: 42000 },
      { currency: 'JPY', amount: 128400 },
    ])
  })

  it('is not settled when the trip has no expenses', () => {
    const view = settleView(order, [], [], 'bear')
    expect(view.allSettled).toBe(false)
    expect(view.mine).toEqual([])
    expect(view.transfers).toEqual([])
  })
})
