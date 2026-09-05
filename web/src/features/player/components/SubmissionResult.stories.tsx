import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router-dom";
import { SubmissionResult } from "./SubmissionResult";

const meta: Meta<typeof SubmissionResult> = {
  title: "Player/SubmissionResult",
  component: SubmissionResult,
  decorators: [(Story) => <MemoryRouter><div className="max-w-sm"><Story /></div></MemoryRouter>],
  args: { outcome: "correct", completionContent: "<p>The mill dates from 1850 and ground rye until 1961.</p>" },
  argTypes: { outcome: { control: "select", options: ["correct", "approved", "pending", "rejected", "queued"] } },
};
export default meta;
type Story = StoryObj<typeof SubmissionResult>;

export const Correct: Story = {};
export const CorrectWithUnlock: Story = { args: { unlockedCount: 2 } };
export const Pending: Story = { args: { outcome: "pending", completionContent: null } };
export const Rejected: Story = { args: { outcome: "rejected", feedback: "Count only the wheels inside the circle.", completionContent: null } };
export const Queued: Story = { args: { outcome: "queued", completionContent: null } };
