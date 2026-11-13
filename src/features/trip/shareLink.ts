/**
 * The link the copy buttons put on the clipboard. openExternalBrowser=1 makes LINE
 * open it in the phone's own browser (Safari) instead of LINE's in-app browser,
 * whose storage is separate; everything else ignores the parameter.
 */
export function shareUrl(origin: string, shareToken: string): string {
  const url = new URL(`/t/${shareToken}`, origin)
  url.searchParams.set('openExternalBrowser', '1')
  return url.href
}
