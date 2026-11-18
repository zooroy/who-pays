import { describe, expect, it } from 'vitest'
import { isSafeToReload } from './appUpdate'

const token = 'Ab3dEf6hIj9kLm2nOp5qRs'
const expense = '6f1c2b8e-1d2a-4b3c-8d4e-5f6a7b8c9d0e'
const idle = { hasForm: false, hasDialog: false, isBusy: false }

describe('isSafeToReload', () => {
  // @scenario 在安全的時機自動套用新版本 › 在支出列表時更新
  it('allows list and detail pages with nothing open', () => {
    for (const pathname of [
      '/',
      `/t/${token}`,
      `/t/${token}/settle`,
      `/t/${token}/expenses/${expense}`,
    ])
      expect(isSafeToReload({ pathname, ...idle })).toBe(true)
  })
  // @scenario 在安全的時機自動套用新版本 › 填寫支出時不打斷
  it('never reloads pages where something is being filled in', () => {
    for (const pathname of [
      `/t/${token}/expenses/new`,
      `/t/${token}/expenses/${expense}/edit`,
      '/new',
      '/login',
    ])
      expect(isSafeToReload({ pathname, ...idle })).toBe(false)
  })
  // @scenario 在安全的時機自動套用新版本 › 填寫支出時不打斷
  // @scenario 在安全的時機自動套用新版本 › 辨識收據時不打斷
  it('waits while a form, the receipt wait screen or a request is in progress', () => {
    expect(isSafeToReload({ pathname: `/t/${token}`, ...idle, hasForm: true })).toBe(false)
    expect(isSafeToReload({ pathname: `/t/${token}`, ...idle, hasDialog: true })).toBe(false)
    expect(isSafeToReload({ pathname: `/t/${token}/settle`, ...idle, isBusy: true })).toBe(false)
    expect(isSafeToReload({ pathname: '/', ...idle, hasForm: true })).toBe(false)
  })
})
