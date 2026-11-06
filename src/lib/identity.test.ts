import { describe, expect, it } from 'vitest'
import {
  deleteMemberError,
  hasErrorCode,
  membershipError,
  parseIdentityKey,
  pendingMigrations,
  readLocalIdentities,
} from './identity'

function storage(values: Record<string, string>) {
  const keys = Object.keys(values)
  return {
    length: keys.length,
    key: (i: number) => keys[i] ?? null,
    getItem: (k: string) => values[k] ?? null,
  }
}

describe('舊的 localStorage 身份', () => {
  it('只辨識旅程身份的 key', () => {
    expect(parseIdentityKey('whopays:trip:abc:member')).toBe('abc')
    expect(parseIdentityKey('whopays:trip::member')).toBeNull()
    expect(parseIdentityKey('whopays:trip:a:b:member')).toBeNull()
    expect(parseIdentityKey('sb-127-auth-token')).toBeNull()
  })
  it('讀出所有旅程身份，略過其他資料', () => {
    const found = readLocalIdentities(
      storage({
        'whopays:trip:t1:member': 'm1',
        'sb-auth-token': '{}',
        'whopays:trip:t2:member': 'm2',
      }),
    )
    expect(found).toEqual([
      { key: 'whopays:trip:t1:member', tripId: 't1', memberId: 'm1' },
      { key: 'whopays:trip:t2:member', tripId: 't2', memberId: 'm2' },
    ])
  })
  it('資料庫已有身份的旅程不搬移，沒有或為 null 的才搬', () => {
    const local = readLocalIdentities(
      storage({
        'whopays:trip:t1:member': 'm1',
        'whopays:trip:t2:member': 'm2',
        'whopays:trip:t3:member': 'm3',
      }),
    )
    const pending = pendingMigrations(local, [
      { trip_id: 't1', member_id: 'other' },
      { trip_id: 't2', member_id: null },
    ])
    expect(pending.map((p) => p.tripId)).toEqual(['t2', 't3'])
  })
})

describe('錯誤訊息', () => {
  it('只對應已知 RPC 錯誤，不把內部錯誤直接顯示給使用者', () => {
    expect(membershipError({ message: 'AVATAR_TAKEN' })).toBe('這個角色剛剛被選走了，請換一個。')
    expect(membershipError({ message: 'TRIP_NOT_FOUND' })).toBe('找不到這趟旅程。連結可能打錯了。')
    expect(membershipError({ message: 'OWNER_REQUIRED' })).toBe('只有擁有者可以這樣做。')
    expect(hasErrorCode(null, 'TRIP_NOT_FOUND')).toBe(false)
    expect(membershipError(new Error('internal details'))).not.toContain('internal details')
  })
  it('刪除成員時說明還有幾筆紀錄', () => {
    expect(deleteMemberError({ message: 'MEMBER_HAS_RECORDS', details: '3' }, '阿美')).toBe(
      '阿美還有 3 筆支出或還款紀錄，請先修改或刪除這些紀錄。',
    )
    expect(deleteMemberError({ message: 'MEMBER_HAS_RECORDS', details: null }, '阿美')).toBe(
      '阿美還有支出或還款紀錄，請先修改或刪除這些紀錄。',
    )
    expect(deleteMemberError(new Error('x'), '阿美')).toBe('操作失敗，請確認網路連線後再試一次。')
  })
})
