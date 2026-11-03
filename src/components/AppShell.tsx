import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { StampIcon, TicketIcon } from './icons'
import './AppShell.css'

interface AppShellProps {
  title: ReactNode
  /** Right side of the header, usually the member avatar row. */
  headerExtra?: ReactNode
  /** Thumb-zone actions above the tab bar (拍收據, 手動新增). */
  thumbBar?: ReactNode
  /** Base path of the trip, e.g. /t/abc. Shows the 支出 / 結算 tabs when set. */
  tripPath?: string
  children: ReactNode
}

/**
 * One-handed layout: content scrolls, everything you tap often sits in the
 * lower half of the screen (design.md §8).
 */
export function AppShell({ title, headerExtra, thumbBar, tripPath, children }: AppShellProps) {
  return (
    <div className={`app-shell${thumbBar ? ' app-shell--thumb' : ''}${tripPath ? ' app-shell--tabs' : ''}`}>
      <header className="app-shell__header">
        <h1 className="app-shell__title">{title}</h1>
        {headerExtra && <div className="app-shell__extra">{headerExtra}</div>}
      </header>
      <main className="app-shell__content">{children}</main>
      {(thumbBar || tripPath) && (
        <div className="app-shell__bottom">
          {thumbBar && <div className="thumb-bar">{thumbBar}</div>}
          {tripPath && (
            <nav className="tab-bar" aria-label="旅程">
              <NavLink to={tripPath} end className="tab-bar__tab">
                <TicketIcon />
                <span>支出</span>
              </NavLink>
              <NavLink to={`${tripPath}/settle`} className="tab-bar__tab">
                <StampIcon />
                <span>結算</span>
              </NavLink>
            </nav>
          )}
        </div>
      )}
    </div>
  )
}

interface AvatarRowProps {
  children: ReactNode
  label?: string
}

/** Overlapping row of member avatars for the header. */
export function AvatarRow({ children, label = '成員' }: AvatarRowProps) {
  return (
    <div className="avatar-row" role="group" aria-label={label}>
      {children}
    </div>
  )
}
