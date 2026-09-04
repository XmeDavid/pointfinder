import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";
import { Label } from "./label";

const meta: Meta<typeof Input> = {
  title: "Core/Input",
  component: Input,
  args: { placeholder: "Team code", disabled: false },
};
export default meta;
type Story = StoryObj<typeof Input>;

export const Playground: Story = {};
export const WithLabel: Story = {
  render: (args) => (
    <div className="grid w-72 gap-2">
      <Label htmlFor="code">Team code</Label>
      <Input id="code" {...args} />
    </div>
  ),
};
export const Disabled: Story = { args: { disabled: true, value: "FALCONS" } };
export const Invalid: Story = { args: { "aria-invalid": true, defaultValue: "???" } };
