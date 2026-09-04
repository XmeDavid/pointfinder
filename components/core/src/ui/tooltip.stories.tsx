import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Tooltip } from "./tooltip";

const meta: Meta<typeof Tooltip> = { title: "Core/Tooltip", component: Tooltip };
export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Playground: Story = {
  render: () => (
    <Tooltip content="Writes the base URL and token to the tag">
      <Button variant="outline">Write tag</Button>
    </Tooltip>
  ),
};
