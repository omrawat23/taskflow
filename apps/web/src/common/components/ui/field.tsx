import { type ReactElement, cloneElement, useId } from 'react'
import { Label } from './input'

interface FieldProps {
  label: string
  error?: string | undefined
  /** A single Input/Textarea; the Field wires id, aria-invalid and aria-describedby onto it. */
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>
}

/** Label + control + error message, accessible by default. */
export const Field = ({ label, error, children }: FieldProps) => {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, {
        id,
        ...(error ? { 'aria-invalid': true, 'aria-describedby': errorId } : {}),
      })}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
