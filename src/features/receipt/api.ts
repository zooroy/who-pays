import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { isReceiptResult, type ReceiptResult, type ScanFailure } from './model'

const MAX_EDGE = 1600
const QUALITY = 0.8

/** design.md §7: longest edge 1600px, JPEG q=0.8, EXIF orientation applied. */
export async function compressPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is not available')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode JPEG'))),
      'image/jpeg',
      QUALITY,
    ),
  )
}

export async function uploadReceipt(tripId: string, photo: Blob): Promise<string> {
  const path = `${tripId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from('receipts')
    // Hosted Storage serves downloads through a CDN; keep the cache short so a
    // deleted receipt disappears for trip members within a minute.
    .upload(path, photo, { contentType: 'image/jpeg', cacheControl: '60' })
  if (error) throw error
  return path
}

export async function removeReceipt(path: string) {
  await supabase.storage.from('receipts').remove([path])
}

export type ScanOutcome = { ok: true; result: ReceiptResult } | { ok: false; code: ScanFailure }

const KNOWN: readonly ScanFailure[] = [
  'QUOTA_EXCEEDED',
  'NOT_A_RECEIPT',
  'TIMEOUT',
  'UPSTREAM_ERROR',
  'FORBIDDEN',
]

export async function parseReceipt(tripId: string, path: string): Promise<ScanOutcome> {
  const { data, error } = await supabase.functions.invoke('parse-receipt', {
    body: { trip_id: tripId, path },
  })
  if (!error) {
    return isReceiptResult(data)
      ? { ok: true, result: data }
      : { ok: false, code: 'UPSTREAM_ERROR' }
  }
  if (error instanceof FunctionsFetchError) return { ok: false, code: 'NETWORK' }
  if (error instanceof FunctionsHttpError) {
    const body: unknown = await (error.context as Response).json().catch(() => null)
    const code =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>).code : null
    const known = KNOWN.find((k) => k === code)
    if (known) return { ok: false, code: known }
  }
  return { ok: false, code: 'UPSTREAM_ERROR' }
}
