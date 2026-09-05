import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";

const meta: Meta<typeof Switch> = { title: "Core/Switch", component: Switch, args: { checked: true } };
export default meta;
type Story = StoryObj<typeof Switch>;

export const Playground: Story = {
  render: function Render(args) {
    const [on, setOn] = useState(args.checked);
    return <Switch {...args} checked={on} onCheckedChange={setOn} aria-label="Allow library photos" />;
  },
};
export const Off: Story = { args: { checked: false, onCheckedChange: () => {} } };
export const Disabled: Story = { args: { checked: true, disabled: true, onCheckedChange: () => {} } };
