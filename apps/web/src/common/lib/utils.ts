import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn/ui helper: merge conditional class names and de-duplicate Tailwind utilities. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

/** Human-readable error text for anything thrown by a query or mutation. */
export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : 'Something went wrong'
