import { describe, expect, it } from 'vitest'
import { scanFailureMessage } from './model'

describe('scanFailureMessage', () => {
  it('tells the user the model is busy and to try again later', () => {
    expect(scanFailureMessage('MODEL_BUSY')).toBe('自動辨識現在太忙，請稍後再試或手動輸入。')
  })
  it('keeps the plain timeout message', () => {
    expect(scanFailureMessage('TIMEOUT')).toBe('辨識花太久時間了，請手動輸入。')
  })
  it('keeps the generic message for other upstream errors', () => {
    expect(scanFailureMessage('UPSTREAM_ERROR')).toBe('自動辨識暫時無法使用，請手動輸入。')
  })
})
