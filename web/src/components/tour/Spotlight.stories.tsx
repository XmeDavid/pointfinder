import type { Meta, StoryObj } from '@storybook/react-vite'
import { Spotlight } from './Spotlight'

const meta: Meta<typeof Spotlight> = { title: 'Tutorials/Spotlight', component: Spotlight }
export default meta
type Story = StoryObj<typeof Spotlight>

function rect(top: number, left: number, width: number, height: number): DOMRect {
  return { top, left, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect
}

export const OverAButton: Story = {
  render: function Render() {
    return (
      <div className="relative h-64">
        <button
          type="button"
          className="absolute left-10 top-10 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Go live
        </button>
        <Spotlight rect={rect(60, 40, 120, 40)} />
      </div>
    )
  },
  parameters: {
    docs: { description: { story: 'The scrim covers the viewport and is never clickable; only the padded cut-out stays bright.' } },
  },
}

export const WideAnchor: Story = {
  render: () => <Spotlight rect={rect(200, 0, 900, 320)} />,
}
