import type { Meta, StoryObj } from "@storybook/react-vite";
import type { PendingAction } from "@pointfinder/game-core";
import { SyncBanner } from "./SyncBanner";

const pending = (over: Partial<PendingAction>): PendingAction =>
  ({ type: "check_in", id: "a1", gameId: "g", baseId: "b", proof: { type: "nfc", token: "t" }, createdAt: "2026-09-05T09:00:00Z", attempts: 0, nextAttemptAt: 0, state: "pending", ...over }) as PendingAction;

const meta: Meta<typeof SyncBanner> = {
  title: "Player/SyncBanner",
  component: SyncBanner,
  decorators: [(Story) => <div className="max-w-sm"><Story /></div>],
  args: { fromCache: false, pending: [], needsAuth: false, onRetry: () => {}, onDiscard: () => {} },
};
export default meta;
type Story = StoryObj<typeof SyncBanner>;

export const Nothing: Story = {};
export const Offline: Story = { args: { fromCache: true } };
export const Queued: Story = { args: { pending: [pending({ id: "a1" }), pending({ id: "a2", type: "submission" } as never)] } };
export const Failed: Story = { args: { pending: [pending({ id: "a3", state: "failed", lastError: "No challenge assigned to this base" })] } };
export const SessionExpired: Story = { args: { needsAuth: true } };
export const Uploading: Story = {
  args: {
    pending: [pending({
      id: "s1", type: "submission", challengeId: "c", answer: "",
      media: [
        { id: "m1", name: "team-photo.jpg", contentType: "image/jpeg", size: 2_400_000, uploadedBytes: 1_200_000 },
        { id: "m2", name: "summit-video-with-a-long-file-name.mp4", contentType: "video/mp4", size: 18_000_000, uploadedBytes: 0 },
      ],
    } as never)],
  },
};
