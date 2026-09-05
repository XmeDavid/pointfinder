import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "@/components/ui/badge";

const meta: Meta<typeof Badge> = {
  title: "Core/Badge",
  component: Badge,
  args: { children: "Live", variant: "default" },
  argTypes: { variant: { control: "select", options: ["default", "secondary", "destructive", "outline", "warning", "success", "info"] } },
};
export default meta;
type Story = StoryObj<typeof Badge>;

export const Playground: Story = {};

export const StatusTones: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="success">Completed</Badge>
      <Badge variant="info">Checked in</Badge>
      <Badge variant="warning">Pending</Badge>
      <Badge variant="destructive">Rejected</Badge>
      <Badge variant="secondary">Setup</Badge>
      <Badge variant="outline">Not visited</Badge>
    </div>
  ),
  parameters: { docs: { description: { story: "Tones follow the status color rule: green done, blue checked in, amber pending, red rejected, gray inactive." } } },
};
