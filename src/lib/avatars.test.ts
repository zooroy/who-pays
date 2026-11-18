import { describe, expect, it } from 'vitest'
import { memberName } from './avatars'

describe('memberName', () => {
  // @scenario 建立旅程 › 未填自己的名字
  // @scenario 透過連結加入 › 只選頭像加入
  // @scenario 佔位成員 › 只選頭像建立佔位成員
  it('uses the avatar name when left empty', () => {
    expect(memberName('', 'bear')).toBe('熊')
  })
  it('treats whitespace as empty', () => {
    expect(memberName('   ', 'koala')).toBe('無尾熊')
  })
  it('keeps a typed name, trimmed', () => {
    expect(memberName('  小華 ', 'cat')).toBe('小華')
  })
})
