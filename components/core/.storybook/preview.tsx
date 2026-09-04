import type { Decorator, Preview } from '@storybook/react-vite'
import { useEffect } from 'react'
import './storybook.css'

/** Mirrors the apps: dark mode is the `.dark` class on <html>. */
const withTheme: Decorator = (Story, context) => {
  const theme = (context.globals.theme as string) ?? 'light'
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  return (
    <div className="bg-background text-foreground min-h-screen p-6">
      <Story />
    </div>
  )
}

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Color theme',
      toolbar: { title: 'Theme', icon: 'mirror', items: ['light', 'dark'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'light' },
  parameters: {
    controls: { matchers: { color: /(background|color)$/i } },
    backgrounds: { disable: true },
  },
}

export default preview
