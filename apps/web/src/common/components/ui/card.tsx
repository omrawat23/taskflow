import type { ComponentProps } from 'react'
import { cn } from '@/common/lib/utils'

// Composition over configuration: <Card><Card.Header/><Card.Body/></Card> instead of title/footer props.
const CardRoot = ({ className, ...props }: ComponentProps<'section'>) => (
  <section
    className={cn('rounded-lg border border-border bg-card shadow-sm', className)}
    {...props}
  />
)

const Header = ({ className, ...props }: ComponentProps<'header'>) => (
  <header className={cn('grid gap-1 border-b border-border p-5', className)} {...props} />
)

const Title = ({ className, children, ...props }: ComponentProps<'h2'>) => (
  <h2 className={cn('text-lg font-semibold', className)} {...props}>
    {children}
  </h2>
)

const Body = ({ className, ...props }: ComponentProps<'div'>) => (
  <div className={cn('p-5', className)} {...props} />
)

export const Card = Object.assign(CardRoot, { Header, Title, Body })
