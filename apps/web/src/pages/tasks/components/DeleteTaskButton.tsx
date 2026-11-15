import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/common/components/ui/button'
import { Dialog } from '@/common/components/ui/dialog'

interface DeleteTaskButtonProps {
  title: string
  onConfirm: () => void
}

// Confirmation state is local to this leaf: opening the dialog never re-renders the list.
export const DeleteTaskButton = ({ title, onConfirm }: DeleteTaskButtonProps) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete "${title}"`}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <Dialog.Header>Delete task?</Dialog.Header>
        <Dialog.Body>“{title}” will be permanently removed.</Dialog.Body>
        <Dialog.Footer>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setOpen(false)
              onConfirm()
            }}
          >
            Delete
          </Button>
        </Dialog.Footer>
      </Dialog>
    </>
  )
}
