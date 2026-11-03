import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearIdentity, hasErrorCode, membershipError, readIdentity, saveIdentity } from './identity'

afterEach(() => vi.unstubAllGlobals())
describe('旅程身份', () => {
  it('隔離各旅程的身份，清除後可重新認領', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    })
    expect(readIdentity('a')).toBeNull()
    saveIdentity('a', 'bear')
    saveIdentity('b', 'cat')
    expect(values.get('whopays:trip:a:member')).toBe('bear')
    clearIdentity('a')
    expect(readIdentity('a')).toBeNull()
    expect(readIdentity('b')).toBe('cat')
    saveIdentity('a', 'penguin')
    expect(readIdentity('a')).toBe('penguin')
  })
  it('只對應已知 RPC 錯誤，不把內部錯誤直接顯示給使用者', () => {
    expect(membershipError({ message: 'AVATAR_TAKEN' })).toBe('這個角色剛剛被選走了，請換一個。')
    expect(membershipError({ message: 'TRIP_NOT_FOUND' })).toBe('找不到這趟旅程。連結可能打錯了。')
    expect(hasErrorCode(null, 'TRIP_NOT_FOUND')).toBe(false)
    expect(membershipError(new Error('internal details'))).not.toContain('internal details')
  })
})
