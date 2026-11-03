import type { ReactNode } from 'react'
import './Ticket.css'

interface TicketProps {
  children: ReactNode
  /** Makes the whole ticket a button (e.g. open expense details). */
  onClick?: () => void
  /** Accessible name when the ticket is a button. */
  label?: string
  /** Lower stub below the perforation, e.g. a stamp or secondary actions. */
  stub?: ReactNode
}

/**
 * A ticket: square corners, punched half-circle notches on both sides of the
 * perforation, and a dashed tear line. Expenses and transfers are tickets.
 */
export function Ticket({ children, onClick, label, stub }: TicketProps) {
  const body = (
    <>
      <div className="ticket__main">{children}</div>
      <div className="ticket__perforation" aria-hidden="true" />
      {stub && <div className="ticket__stub">{stub}</div>}
    </>
  )
  if (onClick) {
    return (
      <button type="button" className="ticket ticket--action" onClick={onClick} aria-label={label}>
        {body}
      </button>
    )
  }
  return <div className="ticket">{body}</div>
}

interface TicketRowProps {
  title: ReactNode
  amount: ReactNode
  meta?: ReactNode
  leading?: ReactNode
}

/** The standard ticket layout: title left, amount right, a meta line underneath. */
export function TicketRow({ title, amount, meta, leading }: TicketRowProps) {
  return (
    <div className="ticket-row">
      {leading && <div className="ticket-row__leading">{leading}</div>}
      <div className="ticket-row__text">
        <span className="ticket-row__title">{title}</span>
        {meta && <span className="ticket-row__meta">{meta}</span>}
      </div>
      <span className="ticket-row__amount amount">{amount}</span>
    </div>
  )
}
