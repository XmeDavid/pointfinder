import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.mdx', '../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  async viteFinal(config) {
    const { default: tailwindcss } = await import('@tailwindcss/vite')
    config.plugins = [...(config.plugins ?? []), tailwindcss()]
    return config
  },
}

export default config
