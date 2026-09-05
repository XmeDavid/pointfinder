import type { Meta, StoryObj } from "@storybook/react-vite";
import { Alert } from "@/components/ui/alert";

const meta: Meta<typeof Alert> = {
  title: "Core/Alert",
  component: Alert,
  args: { variant: "info", children: "Your team already checked in here." },
  argTypes: { variant: { control: "select", options: ["destructive", "warning", "info"] } },
};
export default meta;
type Story = StoryObj<typeof Alert>;

export const Playground: Story = {};
export const Info: Story = { args: { variant: "info" } };
export const Warning: Story = { args: { variant: "warning", children: "No signal. Your answer will be sent when you're back online." } };
export const Destructive: Story = { args: { variant: "destructive", children: "That tag belongs to a different base." } };
