import type { Meta, StoryObj } from '@storybook/react-vite'
import { TourPill } from './TourPill'

const meta: Meta<typeof TourPill> = {
  title: 'Tutorials/TourPill',
  component: TourPill,
  args: { step: 4, total: 12, onResume: () => {}, inline: true },
}
export default meta
type Story = StoryObj<typeof TourPill>

export const Default: Story = {}
export const NearTheEnd: Story = { args: { step: 12, total: 12 } }
