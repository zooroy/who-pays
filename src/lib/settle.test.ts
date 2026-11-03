import { describe, expect, test } from 'vitest'
import {
  balances,
  isAllSettled,
  suggestTransfers,
  totalSpending,
  type NetByMember,
  type SettleExpense,
} from './settle'

const members = ['bear', 'cat', 'penguin', 'fox']

describe('balances', () => {
  test('single currency: bear +500, cat -100, penguin -400 (spec scenario)', () => {
    const three = ['bear', 'cat', 'penguin']
    const result = balances(
      three,
      [
        { amount: 900, currency: 'JPY', paidBy: 'bear', splitAmong: three },
        { amount: 300, currency: 'JPY', paidBy: 'cat', splitAmong: three },
      ],
      [],
    )
    expect(Object.fromEntries(result.get('JPY')!)).toEqual({ bear: 500, cat: -100, penguin: -400 })
  })

  test('currencies never offset each other', () => {
    const result = balances(
      members,
      [
        { amount: 4200, currency: 'JPY', paidBy: 'bear', splitAmong: ['cat'] },
        { amount: 500, currency: 'TWD', paidBy: 'cat', splitAmong: ['bear'] },
      ],
      [],
    )
    expect(result.get('JPY')!.get('cat')).toBe(-4200)
    expect(result.get('JPY')!.get('bear')).toBe(4200)
    expect(result.get('TWD')!.get('bear')).toBe(-500)
    expect(result.get('TWD')!.get('cat')).toBe(500)
  })

  test('splitters can exclude the payer', () => {
    const result = balances(
      members,
      [{ amount: 6000, currency: 'JPY', paidBy: 'bear', splitAmong: ['cat', 'fox'] }],
      [],
    )
    expect(Object.fromEntries(result.get('JPY')!)).toEqual({
      bear: 6000,
      cat: -3000,
      penguin: 0,
      fox: -3000,
    })
  })

  test('rounding remainder follows member order, not splitAmong order', () => {
    const result = balances(
      members,
      [{ amount: 1000, currency: 'JPY', paidBy: 'fox', splitAmong: ['penguin', 'cat', 'bear'] }],
      [],
    )
    expect(result.get('JPY')!.get('bear')).toBe(-334)
    expect(result.get('JPY')!.get('cat')).toBe(-333)
    expect(result.get('JPY')!.get('penguin')).toBe(-333)
  })

  test('settlements move balances back toward zero', () => {
    const result = balances(
      members,
      [{ amount: 4200, currency: 'JPY', paidBy: 'bear', splitAmong: ['cat'] }],
      [{ from: 'cat', to: 'bear', amount: 4200, currency: 'JPY' }],
    )
    expect([...result.get('JPY')!.values()].every((v) => v === 0)).toBe(true)
  })
})

describe('suggestTransfers', () => {
  test('spec scenario: bear +200, cat -100, penguin -100', () => {
    const net: NetByMember = new Map([
      ['bear', 200],
      ['cat', -100],
      ['penguin', -100],
    ])
    expect(suggestTransfers(net, ['bear', 'cat', 'penguin'])).toEqual([
      { from: 'cat', to: 'bear', amount: 100 },
      { from: 'penguin', to: 'bear', amount: 100 },
    ])
  })

  test('settled currency produces no transfers', () => {
    expect(
      suggestTransfers(
        new Map([
          ['bear', 0],
          ['cat', 0],
        ]),
      ),
    ).toEqual([])
  })

  test('applying the suggestions zeroes every balance with at most n-1 transfers', () => {
    // Deterministic pseudo-random trips.
    let seed = 42
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed % n
    }
    for (let trial = 0; trial < 200; trial++) {
      const n = 2 + rand(15)
      const ids = Array.from({ length: n }, (_, i) => `m${i}`)
      const expenses: SettleExpense[] = Array.from({ length: 1 + rand(20) }, () => {
        const splitAmong = ids.filter(() => rand(3) > 0)
        return {
          amount: 1 + rand(50000),
          currency: 'JPY',
          paidBy: ids[rand(n)],
          splitAmong: splitAmong.length ? splitAmong : [ids[0]],
        }
      })
      const net = balances(ids, expenses, []).get('JPY')!
      const transfers = suggestTransfers(net, ids)
      expect(transfers.length).toBeLessThanOrEqual(n - 1)
      const after = balances(
        ids,
        expenses,
        transfers.map((t) => ({ ...t, currency: 'JPY' as const })),
      )
      expect([...after.get('JPY')!.values()].every((v) => v === 0)).toBe(true)
    }
  })
})

describe('totals and all-settled', () => {
  const expenses: SettleExpense[] = [
    { amount: 128400, currency: 'JPY', paidBy: 'bear', splitAmong: members },
    { amount: 42000, currency: 'TWD', paidBy: 'fox', splitAmong: members },
  ]

  test('total spending is listed per currency', () => {
    expect(Object.fromEntries(totalSpending(expenses))).toEqual({ JPY: 128400, TWD: 42000 })
  })

  test('all settled only when every currency is zero and there is an expense', () => {
    expect(isAllSettled(0, new Map())).toBe(false)
    expect(isAllSettled(2, balances(members, expenses, []))).toBe(false)
    const settled = balances(members, expenses, [
      { from: 'cat', to: 'bear', amount: 32100, currency: 'JPY' },
      { from: 'penguin', to: 'bear', amount: 32100, currency: 'JPY' },
      { from: 'fox', to: 'bear', amount: 32100, currency: 'JPY' },
      { from: 'bear', to: 'fox', amount: 10500, currency: 'TWD' },
      { from: 'cat', to: 'fox', amount: 10500, currency: 'TWD' },
      { from: 'penguin', to: 'fox', amount: 10500, currency: 'TWD' },
    ])
    expect(isAllSettled(2, settled)).toBe(true)
  })
})
