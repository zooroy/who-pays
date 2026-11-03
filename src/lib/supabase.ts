import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  throw new Error('缺少 Supabase 設定：請設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY。')
}
export const supabase = createClient(url, key)

// Share the in-flight request across StrictMode mounts; never create two anonymous users.
let signingIn: Promise<void> | undefined
export function ensureSession(): Promise<void> {
  signingIn ??= (async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    if (!data.session) {
      const result = await supabase.auth.signInAnonymously()
      if (result.error) throw result.error
    }
  })().finally(() => {
    signingIn = undefined
  })
  return signingIn
}
