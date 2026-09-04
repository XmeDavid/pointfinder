import type { Meta, StoryObj } from "@storybook/react-vite";
import { FormLabel } from "./form-label";
import { Input } from "./input";
import { Label } from "./label";

const meta: Meta<typeof Label> = { title: "Core/Label", component: Label, args: { children: "Your name" } };
export default meta;
type Story = StoryObj<typeof Label>;

export const Plain: Story = {};
export const Required: Story = {
  render: () => (
    <div className="grid w-72 gap-2">
      <FormLabel htmlFor="n" required>Your name</FormLabel>
      <Input id="n" />
    </div>
  ),
  parameters: { docs: { description: { story: "FormLabel needs i18n keys common.required and common.optional from the host app." } } },
};
export const Optional: Story = {
  render: () => (
    <div className="grid w-72 gap-2">
      <FormLabel htmlFor="d" optional>Description</FormLabel>
      <Input id="d" />
    </div>
  ),
};
