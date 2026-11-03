import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import './Field.css'

interface FieldShellProps {
  label: string
  hint?: ReactNode
  error?: ReactNode
  children: (ids: { id: string; describedBy?: string }) => ReactNode
}

function FieldShell({ label, hint, error, children }: FieldShellProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children({ id, describedBy })}
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  hint?: ReactNode
  error?: ReactNode
}

export function TextField({ label, hint, error, className, ...input }: TextFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <input
          {...input}
          id={id}
          className={`field__control${className ? ` ${className}` : ''}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      )}
    </FieldShell>
  )
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string
  hint?: ReactNode
  error?: ReactNode
}

export function SelectField({ label, hint, error, children, ...select }: SelectFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <select
          {...select}
          id={id}
          className="field__control"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        >
          {children}
        </select>
      )}
    </FieldShell>
  )
}
