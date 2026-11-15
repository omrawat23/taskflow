import { LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'

export const Spinner = ({ label = 'Loading' }: { label?: string }) => (
  <output className="flex items-center gap-2 text-sm text-muted-foreground">
    <LoaderCircle className="size-4 animate-spin" aria-hidden />
    {label}…
  </output>
)

export const ErrorAlert = ({ children }: { children: ReactNode }) => (
  <div
    role="alert"
    className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
  >
    {children}
  </div>
)
