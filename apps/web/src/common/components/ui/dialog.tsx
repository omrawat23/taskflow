import {
  type ComponentProps,
  createContext,
  type ReactNode,
  use,
  useEffect,
  useId,
  useRef,
} from 'react'
import { cn } from '@/common/lib/utils'

// Compound modal on the native <dialog> element (top layer, focus trap, Esc, focus return).
// Callers compose Header/Body/Footer instead of passing a dozen config props:
//   <Dialog open onClose={…}>
//     <Dialog.Header>Delete task?</Dialog.Header>
//     <Dialog.Body>…</Dialog.Body>
//     <Dialog.Footer>…buttons…</Dialog.Footer>
//   </Dialog>

const TitleId = createContext<string | undefined>(undefined)

interface DialogProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

const show = (el: HTMLDialogElement) => {
  try {
    el.showModal()
  } catch {
    el.setAttribute('open', '') // environments without showModal (jsdom)
  }
}

const hide = (el: HTMLDialogElement) => {
  if (typeof el.close === 'function') el.close()
  else el.removeAttribute('open')
}

const DialogRoot = ({ open, onClose, children }: DialogProps) => {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) show(el)
    if (!open && el.open) hide(el)
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault() // let React state drive closing
        onClose()
      }}
      className="m-auto w-full max-w-sm rounded-lg bg-card p-0 text-foreground shadow-lg backdrop:bg-black/40"
    >
      {open ? <TitleId value={titleId}>{children}</TitleId> : null}
    </dialog>
  )
}

const Header = ({ className, children, ...props }: ComponentProps<'h2'>) => (
  <h2 id={use(TitleId)} className={cn('px-5 pt-5 text-base font-semibold', className)} {...props}>
    {children}
  </h2>
)

const Body = ({ className, ...props }: ComponentProps<'div'>) => (
  <div className={cn('px-5 py-3 text-sm text-muted-foreground', className)} {...props} />
)

const Footer = ({ className, ...props }: ComponentProps<'div'>) => (
  <div className={cn('flex justify-end gap-2 px-5 pb-5', className)} {...props} />
)

export const Dialog = Object.assign(DialogRoot, { Header, Body, Footer })
