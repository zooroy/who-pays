import type { ReactNode } from 'react'
import './Notice.css'

interface NoticeProps {
  /** `check` asks the user to verify something; `problem` says what failed and what to do. */
  tone?: 'check' | 'problem'
  children: ReactNode
  action?: ReactNode
}

/**
 * Inline message. Uses ink and a marker instead of red, so red stays reserved
 * for the 已付 stamp (design.md §8).
 */
export function Notice({ tone = 'check', children, action }: NoticeProps) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'problem' ? 'alert' : 'status'}>
      <span className="notice__marker" aria-hidden="true">{tone === 'problem' ? '!' : '?'}</span>
      <div className="notice__body">{children}</div>
      {action && <div className="notice__action">{action}</div>}
    </div>
  )
}
