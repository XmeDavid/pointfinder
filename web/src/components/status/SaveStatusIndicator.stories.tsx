import type { Meta, StoryObj } from '@storybook/react-vite'
import { SaveStatusIndicator } from './SaveStatusIndicator'

const meta: Meta<typeof SaveStatusIndicator> = {
  title: 'Status/SaveStatusIndicator',
  component: SaveStatusIndicator,
  decorators: [(Story) => <div className="max-w-sm"><Story /></div>],
  args: { hideIdle: false, onRetry: () => {}, onDiscard: () => {}, onKeepMine: () => {}, onUseLatest: () => {} },
}
export default meta
type Story = StoryObj<typeof SaveStatusIndicator>

export const Idle: Story = { args: { state: 'idle' } }
export const LocalDraft: Story = { args: { state: 'local' } }
export const Saving: Story = { args: { state: 'saving' } }
export const Saved: Story = { args: { state: 'saved' } }
export const Failed: Story = { args: { state: 'error', error: 'The server did not accept the base: the name is required.' } }
export const Conflict: Story = { args: { state: 'conflict' } }
export const StorageUnavailable: Story = { args: { state: 'storage-error' } }
