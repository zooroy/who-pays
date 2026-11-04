/**
 * The photo picked from the trip screen, handed to the scan screen. A File cannot
 * go through the URL, and opening the picker must happen in the tap itself.
 * Reading does not clear it (React may run initializers twice); the scan screen
 * clears it once scanning starts.
 */
let pending: File | null = null

export function setPendingPhoto(file: File) {
  pending = file
}
export function peekPendingPhoto(): File | null {
  return pending
}
export function clearPendingPhoto() {
  pending = null
}
