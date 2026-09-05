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
