import type { Meta, StoryObj } from "@storybook/react-vite";
import { Textarea } from "@/components/ui/textarea";

const meta: Meta<typeof Textarea> = {
  title: "Core/Textarea",
  component: Textarea,
  args: { placeholder: "Type your answer", rows: 4 },
};
export default meta;
type Story = StoryObj<typeof Textarea>;

export const Playground: Story = {};
export const Filled: Story = { args: { defaultValue: "There are seven carved initials inside the circle on the north face." } };
export const Disabled: Story = { args: { disabled: true, defaultValue: "Sent." } };
