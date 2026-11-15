import type { Meta, StoryObj } from '@storybook/react-vite'
import { Field } from './field'
import { Input, Textarea } from './input'

const meta = {
  title: 'Common/Field',
  component: Field,
  args: { label: 'Email', children: <Input type="email" placeholder="you@example.com" /> },
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
} satisfies Meta<typeof Field>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const WithError: Story = { args: { error: 'Enter a valid email' } }
export const Multiline: Story = { args: { label: 'Description', children: <Textarea rows={3} /> } }
