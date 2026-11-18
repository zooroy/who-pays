import { describe, expect, it } from 'vitest'
import e2eReceipt from '../../../e2e/fixtures/receipt-result.json'
import { isReceiptResult, SLOW_SCAN_MS, scanFailureMessage, scanWaitText } from './model'

describe('scanFailureMessage', () => {
  // @scenario 辨識失敗退回手動輸入 › 辨識服務太忙
  it('tells the user the model is busy and to try again later', () => {
    expect(scanFailureMessage('MODEL_BUSY')).toBe('自動辨識現在太忙，請稍後再試或手動輸入。')
  })
  // @scenario 辨識失敗退回手動輸入 › 單純逾時
  it('keeps the plain timeout message', () => {
    expect(scanFailureMessage('TIMEOUT')).toBe('辨識花太久時間了，請手動輸入。')
  })
  it('keeps the generic message for other upstream errors', () => {
    expect(scanFailureMessage('UPSTREAM_ERROR')).toBe('自動辨識暫時無法使用，請手動輸入。')
  })
})

describe('scanWaitText', () => {
  // @scenario 辨識中專心等待 › 上傳中
  it('shows only the upload label while uploading', () => {
    expect(scanWaitText('upload', 20_000)).toEqual({ label: '正在上傳照片…', hint: null })
  })
  // @scenario 辨識中專心等待 › 辨識中
  it('gives the usual wait while reading the receipt', () => {
    const usual = { label: '辨識中…', hint: '通常要 10 到 30 秒' }
    expect(scanWaitText('parse', 0)).toEqual(usual)
    expect(scanWaitText('parse', 14_999)).toEqual(usual)
  })
  // @scenario 辨識中專心等待 › 辨識比平常久
  it('says it is slower than usual from 15 seconds on', () => {
    expect(SLOW_SCAN_MS).toBe(15_000)
    expect(scanWaitText('parse', 15_000)).toEqual({
      label: '辨識中…',
      hint: '比平常久一點，可以繼續等，或改成手動新增',
    })
  })
})

describe('isReceiptResult', () => {
  it('accepts the fixed result the E2E tests return for parse-receipt', () => {
    expect(isReceiptResult(e2eReceipt)).toBe(true)
  })
})
