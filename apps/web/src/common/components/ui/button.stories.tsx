import type { Meta, StoryObj } from '@storybook/react-vite'
import { Trash2 } from 'lucide-react'
import { Button } from './button'

const meta = {
  title: 'Common/Button',
  component: Button,
  args: { children: 'Button' },
  argTypes: {
    variant: { control: 'select', options: ['default', 'outline', 'ghost', 'destructive'] },
    size: { control: 'select', options: ['default', 'sm', 'icon'] },
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {}
export const Outline: Story = { args: { variant: 'outline' } }
export const Destructive: Story = { args: { variant: 'destructive', children: 'Delete' } }
export const Disabled: Story = { args: { disabled: true } }
export const Icon: Story = {
  args: {
    variant: 'ghost',
    size: 'icon',
    'aria-label': 'Delete',
    children: <Trash2 className="size-4" />,
  },
}
