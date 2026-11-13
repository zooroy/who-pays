/** The member panels on the trip page; they have no URL of their own. */
export type TripPanel = 'members' | 'add' | 'switch' | 'settings' | { edit: string } | null

/** Where the top-left back goes: a page (`to`) or another panel (`panel`, null closes). */
export type BackTarget =
  | { to: string; label: string; titleHidden: boolean }
  | { panel: TripPanel; label: string; titleHidden: boolean }

const TRIP = /^(\/t\/[^/]+)(\/.*)?$/

/**
 * Back goes up one level, iOS style, never through browser history
 * (ios-back-and-trip-delete design §2). An open panel wins over the URL.
 */
export function backTarget(pathname: string, tripName: string, panel: TripPanel): BackTarget {
  if (panel === 'members') return { panel: null, label: tripName, titleHidden: true }
  if (panel !== null) return { panel: 'members', label: '成員', titleHidden: true }
  const match = TRIP.exec(pathname)
  const home = { to: '/', label: '我的旅程', titleHidden: false }
  if (!match) return home
  const [, trip, rest = ''] = match
  const sub = rest.replace(/\/$/, '')
  if (sub === '' || sub === '/settle') return home
  const edit = /^\/expenses\/([^/]+)\/edit$/.exec(sub)
  if (edit) return { to: `${trip}/expenses/${edit[1]}`, label: '支出明細', titleHidden: true }
  if (/^\/expenses\/[^/]+$/.test(sub)) return { to: trip, label: tripName, titleHidden: true }
  return home
}
