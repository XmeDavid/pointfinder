import type { Meta, StoryObj } from "@storybook/react-vite";
import { Collapsible } from "@/components/ui/collapsible";

const meta: Meta<typeof Collapsible> = {
  title: "Core/Collapsible",
  component: Collapsible,
  args: { title: "Advanced settings", description: "Unlock rules, presence checks, variables", defaultOpen: false },
};
export default meta;
type Story = StoryObj<typeof Collapsible>;

export const Closed: Story = { render: (args) => <Collapsible {...args} className="w-96"><p className="text-sm">Hidden until opened.</p></Collapsible> };
export const Open: Story = { args: { defaultOpen: true }, render: (args) => <Collapsible {...args} className="w-96"><p className="text-sm">Visible by default.</p></Collapsible> };
