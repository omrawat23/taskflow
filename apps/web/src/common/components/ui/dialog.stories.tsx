import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Button } from './button'
import { Dialog } from './dialog'

const ConfirmExample = () => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <Dialog.Header>Delete task?</Dialog.Header>
        <Dialog.Body>“Write the report” will be permanently removed.</Dialog.Body>
        <Dialog.Footer>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => setOpen(false)}>
            Delete
          </Button>
        </Dialog.Footer>
      </Dialog>
    </>
  )
}

const meta = {
  title: 'Common/Dialog',
  component: ConfirmExample,
} satisfies Meta<typeof ConfirmExample>

export default meta
export const Composition: StoryObj<typeof meta> = {}
