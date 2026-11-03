import { describe, expect, it } from 'vitest'
import {
  dateLabel,
  expenseError,
  expensePayload,
  groupExpenses,
  initialDraft,
  localDate,
  SAVE_ERROR,
  validateDraft,
  type Expense,
} from './model'
import type { Member, Trip } from '../trip/api'

const trip: Trip = { id: 'trip', name: '東京', share_token: 'token', default_currency: 'JPY' }
const members: Member[] = [
  { id: 'a', name: '熊', avatar_id: 'bear' },
  { id: 'b', name: '貓', avatar_id: 'cat' },
]
const existing: Expense = {
  id: 'expense',
  title: '晚餐',
  amount: 3240,
  currency: 'JPY',
  spent_on: '2026-11-02',
  paid_by: 'b',
  updated_by: 'a',
  created_at: '2026-11-02T10:00:00Z',
  receipt_path: 'trip/receipt.jpg',
  receipt_raw: { total: 3240, notes: 'original' },
  expense_splits: [{ member_id: 'b' }],
  expense_items: [
    { position: 0, name: 'ラーメン', name_zh: '拉麵', qty: 2, unit_price: 1560, amount: 3120 },
  ],
}
describe('expense form', () => {
  it('defaults to the current member, all members, trip currency and local date', () => {
    const now = new Date(2026, 0, 2, 0, 15)
    expect(localDate(now)).toBe('2026-01-02')
    expect(initialDraft(trip, members, 'b', undefined, now)).toEqual({
      title: '',
      amount: '',
      currency: 'JPY',
      spentOn: '2026-01-02',
      paidBy: 'b',
      splitMemberIds: ['a', 'b'],
    })
  })
  it('uses local calendar components rather than UTC components at midnight', () => {
    const date = new Date('2026-01-01T16:15:00Z')
    date.getFullYear = () => 2026
    date.getMonth = () => 0
    date.getDate = () => 2
    expect(localDate(date)).toBe('2026-01-02')
  })
  it.each(['0', '-1', '', '0.5', 'Infinity', '9007199254740992', 'invalid'])(
    'rejects amount %s',
    (amount) => {
      const draft = { ...initialDraft(trip, members, 'a'), title: '飯', amount }
      expect(validateDraft(draft, members).amount).toBeTruthy()
    },
  )
  it('validates required fields and real dates without submitting', () => {
    const draft = {
      ...initialDraft(trip, members, 'a'),
      title: '  ',
      amount: '100',
      splitMemberIds: [],
      spentOn: '2026-02-30',
      paidBy: 'outsider',
    }
    expect(Object.keys(validateDraft(draft, members)).sort()).toEqual([
      'paidBy',
      'spentOn',
      'splitMemberIds',
      'title',
    ])
  })
  it('allows a payer excluded from splitting and assembles a new payload with actor', () => {
    const draft = {
      ...initialDraft(trip, members, 'a'),
      title: ' 計程車 ',
      amount: '3,000',
      splitMemberIds: ['b'],
    }
    expect(validateDraft(draft, members)).toEqual({})
    const payload = expensePayload(trip.id, 'a', draft)
    expect(payload).toMatchObject({
      title: '計程車',
      amount: 3000,
      paid_by: 'a',
      split_member_ids: ['b'],
      member_id: 'a',
      trip_id: 'trip',
      items: [],
      receipt_path: null,
      receipt_raw: null,
    })
    expect(payload).not.toHaveProperty('id')
  })
  it('preserves receipt and all item values when editing another member’s expense', () => {
    const draft = { ...initialDraft(trip, members, 'a', existing), amount: '4000' }
    const payload = expensePayload(trip.id, 'a', draft, existing)
    expect(payload).toMatchObject({
      id: 'expense',
      amount: 4000,
      paid_by: 'b',
      member_id: 'a',
      receipt_path: existing.receipt_path,
      receipt_raw: existing.receipt_raw,
      items: [{ name: 'ラーメン', name_zh: '拉麵', qty: 2, unit_price: 1560, amount: 3120 }],
    })
    expect(existing.amount).toBe(3240)
  })
  it('maps RPC field errors, deleted expenses and retryable failures', () => {
    expect(expenseError({ message: 'SPLITTERS_REQUIRED' }).fields.splitMemberIds).toBeTruthy()
    expect(expenseError({ message: 'EXPENSE_NOT_FOUND' }).message).toBe('這筆支出已被刪除。')
    expect(expenseError(new Error('fetch failed'))).toEqual({ fields: {}, message: SAVE_ERROR })
  })
})
describe('expense list', () => {
  it('groups by date descending, then creation descending without mutating data', () => {
    const input = [
      existing,
      { ...existing, id: 'newer', created_at: '2026-11-02T11:00:00Z' },
      { ...existing, id: 'tomorrow', spent_on: '2026-11-03' },
    ]
    const groups = groupExpenses(input)
    expect(groups.map((g) => g.date)).toEqual(['2026-11-03', '2026-11-02'])
    expect(groups[1].expenses.map((e) => e.id)).toEqual(['newer', 'expense'])
    expect(input[0]).toBe(existing)
    expect(dateLabel('2026-11-02')).toBe('11月2日')
    expect(groupExpenses([])).toEqual([])
  })
})
