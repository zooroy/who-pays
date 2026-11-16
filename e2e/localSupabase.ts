import { execFileSync } from 'node:child_process'

export type LocalSupabase = {
  url: string
  anonKey: string
  serviceRoleKey: string
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])

/** Throws unless the URL points at this machine, so E2E can never touch production. */
export function assertLocalUrl(url: string): string {
  const host = new URL(url).hostname
  if (!LOCAL_HOSTS.has(host)) throw new Error(`E2E only runs against local Supabase, got ${host}`)
  return url
}

function readString(data: Record<string, unknown>, key: string): string {
  const value = data[key]
  if (typeof value !== 'string' || value === '') {
    throw new Error(`supabase status is missing ${key}; run \`supabase start\` first`)
  }
  return value
}

let cached: LocalSupabase | undefined

/** Reads the URL and keys of the running local Supabase (`supabase start`). */
export function localSupabase(): LocalSupabase {
  if (cached) return cached
  const output = execFileSync('supabase', ['status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  // The CLI may print notices before the JSON object.
  const parsed: unknown = JSON.parse(output.slice(output.indexOf('{')))
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Unexpected supabase status')
  const data = parsed as Record<string, unknown>
  cached = {
    url: assertLocalUrl(readString(data, 'API_URL')),
    anonKey: readString(data, 'ANON_KEY'),
    serviceRoleKey: readString(data, 'SERVICE_ROLE_KEY'),
  }
  return cached
}
