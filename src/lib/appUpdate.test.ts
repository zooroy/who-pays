import { describe, expect, it } from 'vitest'
import { isSafeToReload } from './appUpdate'

const token = 'Ab3dEf6hIj9kLm2nOp5qRs'
const expense = '6f1c2b8e-1d2a-4b3c-8d4e-5f6a7b8c9d0e'
const idle = { hasForm: false, hasDialog: false, isBusy: false }

describe('isSafeToReload', () => {
  it('allows list and detail pages with nothing open', () => {
    for (const pathname of [
      '/',
      `/t/${token}`,
      `/t/${token}/settle`,
      `/t/${token}/expenses/${expense}`,
    ])
      expect(isSafeToReload({ pathname, ...idle })).toBe(true)
  })
  it('never reloads pages where something is being filled in', () => {
    for (const pathname of [
      `/t/${token}/expenses/new`,
      `/t/${token}/expenses/${expense}/edit`,
      '/new',
      '/login',
    ])
      expect(isSafeToReload({ pathname, ...idle })).toBe(false)
  })
  it('waits while a form, the receipt wait screen or a request is in progress', () => {
    expect(isSafeToReload({ pathname: `/t/${token}`, ...idle, hasForm: true })).toBe(false)
    expect(isSafeToReload({ pathname: `/t/${token}`, ...idle, hasDialog: true })).toBe(false)
    expect(isSafeToReload({ pathname: `/t/${token}/settle`, ...idle, isBusy: true })).toBe(false)
    expect(isSafeToReload({ pathname: '/', ...idle, hasForm: true })).toBe(false)
  })
})
