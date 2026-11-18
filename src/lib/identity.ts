// Who you are in each trip lives in trip_access.member_id (owner-account design §3).
export interface RemoteIdentity {
  trip_id: string
  member_id: string | null
}

/** Identities the database does not know yet; an identity already stored always wins. */
export function pendingMigrations<T extends { tripId: string; memberId: string }>(
  local: T[],
  remote: RemoteIdentity[],
): T[] {
  const known = new Set(remote.filter((r) => r.member_id).map((r) => r.trip_id))
  return local.filter((l) => !known.has(l.tripId))
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'message' in error && error.message === code
}
export function membershipError(error: unknown): string {
  if (hasErrorCode(error, 'AVATAR_TAKEN')) return '這個角色剛剛被選走了，請換一個。'
  if (hasErrorCode(error, 'TRIP_NOT_FOUND')) return '找不到這趟旅程。連結可能打錯了。'
  if (hasErrorCode(error, 'OWNER_REQUIRED')) return '只有擁有者可以這樣做。'
  return '操作失敗，請確認網路連線後再試一次。'
}
/** Message for a failed member delete; MEMBER_HAS_RECORDS carries the count in details. */
export function deleteMemberError(error: unknown, name: string): string {
  if (!hasErrorCode(error, 'MEMBER_HAS_RECORDS')) return membershipError(error)
  const details =
    typeof error === 'object' && error !== null && 'details' in error ? error.details : null
  const count = typeof details === 'string' && /^\d+$/.test(details) ? ` ${details} 筆` : ''
  return `${name}還有${count}支出或還款紀錄，請先修改或刪除這些紀錄。`
}
