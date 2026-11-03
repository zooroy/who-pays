import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteExpense, saveExpense } from './api'
import type { Expense } from './model'

const mocks = vi.hoisted(() => ({ remove: vi.fn(), rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe('receipts')
        return { remove: mocks.remove }
      },
    },
  },
}))
const expense: Expense = {
  id: 'expense',
  title: '飯',
  amount: 100,
  currency: 'JPY',
  spent_on: '2026-11-03',
  paid_by: 'a',
  updated_by: 'a',
  created_at: '2026-11-03T00:00:00Z',
  receipt_path: 'trip/receipt.jpg',
  receipt_raw: null,
  expense_items: [],
  expense_splits: [{ member_id: 'a' }],
}
beforeEach(() => {
  vi.resetAllMocks()
})
describe('expense mutations', () => {
  it('waits for photo removal before deleting the expense', async () => {
    const order: string[] = []
    mocks.remove.mockImplementation(async () => {
      order.push('photo')
      return { error: null }
    })
    mocks.rpc.mockImplementation(async () => {
      order.push('expense')
      return { error: null }
    })
    await deleteExpense(expense)
    expect(order).toEqual(['photo', 'expense'])
    expect(mocks.remove).toHaveBeenCalledWith(['trip/receipt.jpg'])
    expect(mocks.rpc).toHaveBeenCalledWith('delete_expense', { expense_id: 'expense' })
  })
  it('does not delete the expense when Storage removal fails; retry is possible', async () => {
    const failure = new Error('offline')
    mocks.remove.mockResolvedValueOnce({ error: failure }).mockResolvedValueOnce({ error: null })
    mocks.rpc.mockResolvedValue({ error: null })
    await expect(deleteExpense(expense)).rejects.toBe(failure)
    expect(mocks.rpc).not.toHaveBeenCalled()
    await expect(deleteExpense(expense)).resolves.toBeUndefined()
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it('deletes manual expenses without accessing Storage and propagates RPC errors', async () => {
    const failure = new Error('offline')
    mocks.rpc.mockResolvedValue({ error: failure })
    await expect(deleteExpense({ ...expense, receipt_path: null })).rejects.toBe(failure)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it('propagates save failure without changing the payload', async () => {
    const payload = {
      trip_id: 'trip',
      member_id: 'a',
      title: '飯',
      amount: 100,
      currency: 'JPY' as const,
      spent_on: '2026-11-03',
      paid_by: 'a',
      split_member_ids: ['a'],
      items: [],
      receipt_path: null,
      receipt_raw: null,
    }
    const original = structuredClone(payload)
    const failure = new Error('offline')
    mocks.rpc.mockResolvedValue({ error: failure })
    await expect(saveExpense(payload)).rejects.toBe(failure)
    expect(payload).toEqual(original)
  })
})
