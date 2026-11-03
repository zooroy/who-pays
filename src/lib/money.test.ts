import { describe, expect, test } from 'vitest'
import { formatMoney, parseMoneyInput, splitEvenly } from './money'

describe('formatMoney', () => {
  test('formats JPY and TWD with thousands separators', () => {
    expect(formatMoney(3240, 'JPY')).toBe('¥3,240')
    expect(formatMoney(42000, 'TWD')).toBe('NT$42,000')
    expect(formatMoney(128400, 'JPY')).toBe('¥128,400')
  })

  test('formats negative amounts', () => {
    expect(formatMoney(-500, 'JPY')).toBe('-¥500')
  })
})

describe('parseMoneyInput', () => {
  test('accepts integers with separators', () => {
    expect(parseMoneyInput('3,240', 'JPY')).toBe(3240)
    expect(parseMoneyInput(' 1200 ', 'TWD')).toBe(1200)
  })

  test('rejects fractions for zero-exponent currencies and garbage', () => {
    expect(parseMoneyInput('12.5', 'JPY')).toBeNull()
    expect(parseMoneyInput('abc', 'JPY')).toBeNull()
    expect(parseMoneyInput('-5', 'JPY')).toBeNull()
    expect(parseMoneyInput('', 'JPY')).toBeNull()
  })
})

describe('splitEvenly', () => {
  test('1000 between 3 people is 334 / 333 / 333', () => {
    const shares = splitEvenly(1000, ['a', 'b', 'c'])
    expect([...shares.values()]).toEqual([334, 333, 333])
  })

  test('remainder goes to the earliest ids in order', () => {
    const shares = splitEvenly(11, ['x', 'y', 'z', 'w'])
    expect(Object.fromEntries(shares)).toEqual({ x: 3, y: 3, z: 3, w: 2 })
  })

  test('shares always sum to the original amount', () => {
    for (let amount = 0; amount <= 500; amount += 7) {
      for (let n = 1; n <= 16; n++) {
        const ids = Array.from({ length: n }, (_, i) => `m${i}`)
        const total = [...splitEvenly(amount, ids).values()].reduce((a, b) => a + b, 0)
        expect(total).toBe(amount)
      }
    }
  })

  test('rejects empty splitters and invalid amounts', () => {
    expect(() => splitEvenly(100, [])).toThrow()
    expect(() => splitEvenly(1.5, ['a'])).toThrow()
    expect(() => splitEvenly(-1, ['a'])).toThrow()
  })
})
