const TOKEN = /^[A-Za-z0-9]{22}$/
const IN_PATH = /\/t\/([A-Za-z0-9]{22})(?![A-Za-z0-9])/

/**
 * Finds the share token in pasted text: a full link, a link without https://,
 * or the bare 22-character token. Any domain is accepted, so links from the
 * local and production sites both work. Returns null when there is none.
 */
export function parseShareToken(text: string): string | null {
  const trimmed = text.trim()
  if (TOKEN.test(trimmed)) return trimmed
  return IN_PATH.exec(trimmed)?.[1] ?? null
}
