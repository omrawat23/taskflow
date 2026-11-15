import type { StorybookConfig } from '@storybook/react-vite'

// Components are developed and documented here before they live in the app.
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: { name: '@storybook/react-vite', options: {} },
}

export default config
