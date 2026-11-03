import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './Button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** Large thumb-zone button, e.g. 拍收據. */
  big?: boolean
  icon?: ReactNode
  busy?: boolean
}

/** Button text says what happens: 「儲存支出」, not 「送出」. */
export function Button({
  variant = 'primary',
  big = false,
  icon,
  busy = false,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = ['button', `button--${variant}`, big && 'button--big', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {icon && (
        <span className="button__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </button>
  )
}
