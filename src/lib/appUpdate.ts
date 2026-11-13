/**
 * Applying a new deploy (app-auto-update design). The service worker waits until
 * the app says it is a safe moment, then takes over and the page reloads.
 */

/** Pages that only show saved data: reloading them loses nothing. */
const SAFE_PATHS = [
  /^\/$/,
  /^\/t\/[A-Za-z0-9]+\/?$/,
  /^\/t\/[A-Za-z0-9]+\/settle\/?$/,
  /^\/t\/[A-Za-z0-9]+\/expenses\/(?!new\/?$)[^/]+\/?$/,
]

/**
 * True on a list or detail page with no form being filled in, no wait screen and
 * no request in flight (design §2). A form, dialog or busy button on a safe page
 * (member form, the receipt wait screen, 標記已付 being saved) still means the user
 * is in the middle of something.
 */
export function isSafeToReload({
  pathname,
  hasForm,
  hasDialog,
  isBusy,
}: {
  pathname: string
  hasForm: boolean
  hasDialog: boolean
  isBusy: boolean
}): boolean {
  if (hasForm || hasDialog || isBusy) return false
  return SAFE_PATHS.some((path) => path.test(pathname))
}

/** Set once a new service worker is waiting; cleared when it is applied. */
let pending = false
let activate: ((reloadPage?: boolean) => Promise<void>) | null = null
const CHECK_EVERY_MS = 30 * 60 * 1000

function safeNow(): boolean {
  return isSafeToReload({
    pathname: window.location.pathname,
    hasForm: document.querySelector('main form') !== null,
    hasDialog: document.querySelector('[role="dialog"]') !== null,
    isBusy: document.querySelector('[aria-busy="true"]') !== null,
  })
}

/** Reloads into the new version if one is waiting and nothing is in progress. */
export function tryApplyUpdate() {
  if (!pending || !activate || !safeNow()) return
  pending = false
  void activate(true)
}

/**
 * Registers the service worker and checks for a new deploy on start, when the app
 * comes back to the foreground, and every 30 minutes (design §3).
 */
export async function startAppUpdates() {
  if (!('serviceWorker' in navigator)) return
  const { registerSW } = await import('virtual:pwa-register')
  activate = registerSW({
    immediate: true,
    onNeedRefresh() {
      pending = true
      tryApplyUpdate()
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => void registration.update().catch(() => undefined)
      window.setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return
        check()
        tryApplyUpdate()
      })
    },
  })
}
