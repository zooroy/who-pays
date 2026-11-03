import { useId } from 'react'
import './PaidStamp.css'

interface PaidStampProps {
  /** Short date printed under 已付, e.g. "11/03". */
  date?: string
  /** Play the press animation. Use only right after the user marks a transfer paid. */
  animate?: boolean
  size?: 'medium' | 'large'
}

/**
 * The 已付 seal in 朱肉紅 — the only red in the app and its one bold moment
 * (design.md §8). An SVG turbulence filter roughens the edges like real ink.
 * prefers-reduced-motion collapses the animation to its end state (base.css).
 */
export function PaidStamp({ date, animate = false, size = 'medium' }: PaidStampProps) {
  const filterId = useId().replace(/:/g, '')
  return (
    <span className={`paid-stamp paid-stamp--${size}${animate ? ' paid-stamp--pressing' : ''}`} role="img" aria-label={date ? `已付，${date}` : '已付'}>
      <svg className="paid-stamp__svg" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" result="rough" />
            <feComponentTransfer in="noise" result="speckle">
              <feFuncA type="discrete" tableValues="1 1 1 1 1 1 1 0 1 1" />
            </feComponentTransfer>
            <feComposite in="rough" in2="speckle" operator="in" />
          </filter>
        </defs>
        <g filter={`url(#${filterId})`} fill="none" stroke="currentColor">
          <circle cx="50" cy="50" r="45" strokeWidth="5" />
          <circle cx="50" cy="50" r="38" strokeWidth="1.5" />
          <text x="50" y={date ? 56 : 62} textAnchor="middle" fill="currentColor" stroke="none" className="paid-stamp__label">已付</text>
          {date && (
            <text x="50" y="76" textAnchor="middle" fill="currentColor" stroke="none" className="paid-stamp__date">{date}</text>
          )}
        </g>
      </svg>
    </span>
  )
}
