import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "./skeleton";

const meta: Meta<typeof Skeleton> = { title: "Core/Skeleton", component: Skeleton };
export default meta;
type Story = StoryObj<typeof Skeleton>;

export const ListLoading: Story = {
  render: () => (
    <div className="grid w-80 gap-3">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  ),
};
