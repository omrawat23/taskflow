import type { Preview } from '@storybook/react-vite'
import '../src/index.css'

const preview: Preview = {
  parameters: {
    // Accessibility violations fail the story, not just warn.
    a11y: { test: 'error' },
    layout: 'centered',
  },
}

export default preview
