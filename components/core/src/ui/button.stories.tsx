import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";

const meta: Meta<typeof Button> = {
  title: "Core/Button",
  component: Button,
  args: { children: "Go live", variant: "default", size: "default", disabled: false },
  argTypes: {
    variant: { control: "select", options: ["default", "destructive", "outline", "secondary", "ghost", "link"] },
    size: { control: "select", options: ["default", "sm", "lg", "icon"] },
  },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button>Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
      <Button variant="destructive">Delete game</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button size="sm">Small</Button>
      <Button>Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Add">+</Button>
    </div>
  ),
};

export const Disabled: Story = { args: { disabled: true, children: "Saving…" } };

export const LongLabel: Story = {
  args: { children: "Marcar todas as bases desta equipa como concluídas agora" },
  parameters: { docs: { description: { story: "Portuguese and German labels run long; buttons must not clip." } } },
};
