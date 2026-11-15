import type { ComponentProps } from 'react'
import { cn } from '@/common/lib/utils'

const fieldStyles =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring aria-invalid:border-destructive'

export const Input = ({ className, ...props }: ComponentProps<'input'>) => (
  <input className={cn(fieldStyles, 'h-9', className)} {...props} />
)

export const Textarea = ({ className, ...props }: ComponentProps<'textarea'>) => (
  <textarea className={cn(fieldStyles, 'min-h-20', className)} {...props} />
)

/** A label must point at its control. */
export const Label = ({
  className,
  htmlFor,
  ...props
}: ComponentProps<'label'> & { htmlFor: string }) => (
  <label htmlFor={htmlFor} className={cn('text-sm font-medium', className)} {...props} />
)
