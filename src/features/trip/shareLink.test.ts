import { describe, expect, it } from 'vitest'
import { shareUrl } from './shareLink'

const token = 'Ab3dEf6hIj9kLm2nOp5qRs'

describe('shareUrl', () => {
  // @scenario 分享連結 › 從 LINE 開啟分享連結
  it('builds a production link that LINE opens in the external browser', () => {
    expect(shareUrl('https://who-pays.who-pays.workers.dev', token)).toBe(
      `https://who-pays.who-pays.workers.dev/t/${token}?openExternalBrowser=1`,
    )
  })
  it('builds a local link the same way', () => {
    expect(shareUrl('http://localhost:5173', token)).toBe(
      `http://localhost:5173/t/${token}?openExternalBrowser=1`,
    )
  })
  it('ignores a trailing slash on the origin', () => {
    expect(shareUrl('http://localhost:5173/', token)).toBe(shareUrl('http://localhost:5173', token))
  })
})
