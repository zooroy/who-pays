import { describe, expect, it } from 'vitest'
import {
  extractResult,
  isRetryable,
  parseRequest,
  timeoutError,
  upstreamError,
} from './receipt.ts'

const trip = '6f1c2b8e-1d2a-4b3c-8d4e-5f6a7b8c9d0e'
const photo = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

describe('parseRequest', () => {
  it('accepts a photo inside the trip folder', () => {
    expect(parseRequest({ trip_id: trip, path: `${trip}/${photo}.jpg` })).toEqual({
      tripId: trip,
      path: `${trip}/${photo}.jpg`,
    })
  })
  it('rejects paths outside the trip folder or with traversal', () => {
    const other = 'ffffffff-1d2a-4b3c-8d4e-5f6a7b8c9d0e'
    expect(parseRequest({ trip_id: trip, path: `${other}/${photo}.jpg` })).toBeNull()
    expect(parseRequest({ trip_id: trip, path: `${trip}/../${other}/${photo}.jpg` })).toBeNull()
    expect(parseRequest({ trip_id: trip, path: `${trip}/${photo}.png` })).toBeNull()
    expect(parseRequest({ trip_id: 'x', path: `x/${photo}.jpg` })).toBeNull()
    expect(parseRequest(null)).toBeNull()
  })
})

describe('upstreamError', () => {
  it('maps 429 and 402 to QUOTA_EXCEEDED, 503 to MODEL_BUSY, everything else to UPSTREAM_ERROR', () => {
    expect(upstreamError(429)).toBe('QUOTA_EXCEEDED')
    expect(upstreamError(402)).toBe('QUOTA_EXCEEDED')
    expect(upstreamError(503)).toBe('MODEL_BUSY')
    expect(upstreamError(500)).toBe('UPSTREAM_ERROR')
    expect(upstreamError(400)).toBe('UPSTREAM_ERROR')
  })
})

describe('timeoutError', () => {
  it('reports a busy model when the attempt before the timeout got a 503', () => {
    expect(timeoutError(503)).toBe('MODEL_BUSY')
  })
  it('reports a plain timeout otherwise', () => {
    expect(timeoutError(500)).toBe('TIMEOUT')
    expect(timeoutError(null)).toBe('TIMEOUT')
  })
})

describe('extractResult', () => {
  const wrap = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] })
  it('parses the structured JSON text', () => {
    expect(extractResult(wrap('{"is_receipt":true,"total":3240}'))).toEqual({
      is_receipt: true,
      total: 3240,
    })
  })
  it('returns null for missing, broken or shapeless output', () => {
    expect(extractResult({})).toBeNull()
    expect(extractResult(wrap('not json'))).toBeNull()
    expect(extractResult(wrap('[1]'))).toBeNull()
    expect(extractResult(wrap('{"total":1}'))).toBeNull()
  })
})

describe('isRetryable', () => {
  it('retries only a busy or failing model', () => {
    expect(isRetryable(503)).toBe(true)
    expect(isRetryable(500)).toBe(true)
    expect(isRetryable(429)).toBe(false)
    expect(isRetryable(400)).toBe(false)
  })
})
