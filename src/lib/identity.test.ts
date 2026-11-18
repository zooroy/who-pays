import { describe, expect, it } from 'vitest'
import { deleteMemberError, hasErrorCode, membershipError, pendingMigrations } from './identity'

describe('登入時沿用身份', () => {
  // @scenario 記住身份 › 第一次登入沿用身份
  it('資料庫已有身份的旅程不沿用，沒有或為 null 的才沿用', () => {
    const local = [
      { tripId: 't1', memberId: 'm1' },
      { tripId: 't2', memberId: 'm2' },
      { tripId: 't3', memberId: 'm3' },
    ]
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
  // @scenario 刪除成員 › 成員有紀錄
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
