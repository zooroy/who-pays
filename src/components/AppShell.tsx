import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { BackIcon, StampIcon, TicketIcon } from './icons'
import './AppShell.css'

interface AppShellProps {
  title: ReactNode
  /** Right side of the header, usually the member avatar row. */
  headerExtra?: ReactNode
  /** Thumb-zone actions above the tab bar (拍收據, 手動新增). */
  thumbBar?: ReactNode
  /** Base path of the trip, e.g. /t/abc. Shows the 支出 / 結算 tabs when set. */
  tripPath?: string
  /**
   * 「‹ <label>」above the title: up one level. A link (`to`) for pages, a button
   * (`onClick`) for panels that have no URL. `label` names the destination.
   */
  back?: { label: string; to: string } | { label: string; onClick: () => void }
  /** Hide the title visually when the content already has its own heading. */
  titleHidden?: boolean
  children: ReactNode
}

/**
 * One-handed layout: content scrolls, everything you tap often sits in the
 * lower half of the screen (design.md §8).
 */
export function AppShell({
  title,
  headerExtra,
  thumbBar,
  tripPath,
  back,
  titleHidden = false,
  children,
}: AppShellProps) {
  return (
    <div
      className={`app-shell${thumbBar ? ' app-shell--thumb' : ''}${tripPath ? ' app-shell--tabs' : ''}`}
    >
      <header className="app-shell__header">
        <div className="app-shell__heading">
          {back && <BackLink back={back} />}
          <h1 className={`app-shell__title${titleHidden ? ' visually-hidden' : ''}`}>{title}</h1>
        </div>
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

function BackLink({ back }: { back: NonNullable<AppShellProps['back']> }) {
  const content = (
    <>
      <BackIcon />
      <span>{back.label}</span>
    </>
  )
  const label = `回到${back.label}`
  if ('to' in back)
    return (
      <Link className="app-shell__back" to={back.to} aria-label={label}>
        {content}
      </Link>
    )
  return (
    <button type="button" className="app-shell__back" onClick={back.onClick} aria-label={label}>
      {content}
    </button>
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
