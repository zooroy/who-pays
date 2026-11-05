import { describe, expect, it } from 'vitest'
import { parseShareToken } from './shareLink'

const token = 'Ab3dEf6hIj9kLm2nOp5qRs'

describe('parseShareToken', () => {
  it('reads a full link', () => {
    expect(parseShareToken(`https://who-pays.who-pays.workers.dev/t/${token}`)).toBe(token)
  })
  it('reads a link inside a message, with a trailing path', () => {
    expect(parseShareToken(`一起記帳：who-pays.who-pays.workers.dev/t/${token}/settle 謝謝`)).toBe(
      token,
    )
  })
  it('reads a bare token', () => {
    expect(parseShareToken(`  ${token}\n`)).toBe(token)
  })
  it('rejects text that is not a share link', () => {
    expect(parseShareToken('台南之旅')).toBeNull()
    expect(parseShareToken('https://example.com/t/short')).toBeNull()
    expect(parseShareToken(`https://example.com/t/${token}x`)).toBeNull()
    expect(parseShareToken('')).toBeNull()
  })
})
