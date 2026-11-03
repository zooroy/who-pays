const key = (tripId: string) => `whopays:trip:${tripId}:member`
export function readIdentity(tripId: string): string | null {
  return localStorage.getItem(key(tripId))
}
export function saveIdentity(tripId: string, memberId: string): void {
  localStorage.setItem(key(tripId), memberId)
}
export function clearIdentity(tripId: string): void {
  localStorage.removeItem(key(tripId))
}
export function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'message' in error && error.message === code
}
export function membershipError(error: unknown): string {
  if (hasErrorCode(error, 'AVATAR_TAKEN')) return '這個角色剛剛被選走了，請換一個。'
  if (hasErrorCode(error, 'TRIP_NOT_FOUND')) return '找不到這趟旅程。連結可能打錯了。'
  return '操作失敗，請確認網路連線後再試一次。'
}
