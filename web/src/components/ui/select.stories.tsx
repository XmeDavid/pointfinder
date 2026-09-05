import type { Meta, StoryObj } from "@storybook/react-vite";
import { Select } from "@/components/ui/select";

const meta: Meta<typeof Select> = { title: "Core/Select", component: Select };
export default meta;
type Story = StoryObj<typeof Select>;

export const Playground: Story = {
  render: () => (
    <Select defaultValue="text" className="w-64">
      <option value="text">Text answer</option>
      <option value="file">Photo</option>
      <option value="none">Check-in only</option>
    </Select>
  ),
};
export const Disabled: Story = {
  render: () => (
    <Select disabled className="w-64">
      <option>Locked</option>
    </Select>
  ),
};
