import { describe, expect, it } from 'vitest'
import { memberName } from './avatars'

describe('memberName', () => {
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
