import type { Meta, StoryObj } from '@storybook/react-vite'
import { CoachBubble } from './CoachBubble'

const meta: Meta<typeof CoachBubble> = {
  title: 'Tutorials/CoachBubble',
  component: CoachBubble,
  args: {
    title: 'Place your first base',
    body: 'Tap the map where players should go, then choose Place base here.',
    step: 3,
    total: 12,
    anchorRect: null,
    inline: true,
    onClose: () => {},
  },
}
export default meta
type Story = StoryObj<typeof CoachBubble>

export const Default: Story = {}

export const WithAside: Story = {
  args: { aside: 'Bases can be moved later by dragging the marker.' },
}

export const AckStep: Story = {
  args: { onAck: () => {} },
}

export const FinalStep: Story = {
  args: { onAck: () => {}, isLast: true, title: 'That is a whole game', body: 'Your game is live and every mode is set up.' },
}

export const WithLaterAction: Story = {
  args: {
    onAck: () => {},
    onLater: () => {},
    title: 'Write the NFC tag',
    body: 'Hold a tag against the phone to link it to this base.',
    aside: 'Not now? The Tags tab lists every unlinked base and the readiness pill reminds you.',
  },
}

export const LongGermanCopy: Story = {
  args: {
    title: 'Platziere deine erste Basis auf der Karte',
    body: 'Tippe auf die Karte an der Stelle, an der die Teams später ankommen sollen, und wähle anschließend „Basis hier platzieren“, damit die Basis mit den Koordinaten dieses Punktes angelegt wird.',
    aside: 'Die Basis lässt sich später jederzeit verschieben, indem du die Markierung ziehst oder die Koordinaten direkt eingibst.',
    onAck: () => {},
    onLater: () => {},
  },
}
