import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { Challenge, Tag } from "@/types";
import { ChallengePicker } from "./ChallengePicker";

const tag = (id: string, label: string, color: string): Tag =>
  ({ id, gameId: "g", label, color, createdAt: "2026-09-05T09:00:00Z", updatedAt: "2026-09-05T09:00:00Z" });
const tags = [tag("t1", "Outdoor", "#16a34a"), tag("t2", "Photo", "#eab308"), tag("t3", "Night", "#7c3aed")];

const challenge = (id: string, title: string, over: Partial<Challenge> = {}): Challenge =>
  ({ id, gameId: "g", title, description: "", content: "", completionContent: "", answerType: "text", autoValidate: false, points: 10, locationBound: false, requirePresenceToSubmit: false, ...over }) as Challenge;
const challenges = [
  challenge("c1", "Count the arches of the old mill", { tagIds: ["t1"] }),
  challenge("c2", "Photograph the chapel bell", { answerType: "file", points: 25, tagIds: ["t1", "t2"] }),
  challenge("c3", "Name the peak you can see from the lookout", { points: 5, locationBound: true, fixedBaseId: "b3" }),
  challenge("c4", "Find the hidden cache after dark", { answerType: "none", tagIds: ["t3"] }),
  challenge("c5", "Sketch the ruined tower", { tagIds: ["t2"] }),
];

function Demo({ value: initial = null as string | null, allowed = ["c1", "c2", "c4", "c5"], disabled = false, dimmed = false }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <div className="max-w-xs">
      <ChallengePicker
        value={value}
        challenges={challenges}
        allowedIds={new Set(allowed)}
        reasonFor={(id) => (id === "c3" ? "At Lookout" : null)}
        tags={tags}
        onChange={setValue}
        label="Old mill · Falcons"
        disabled={disabled}
        dimmed={dimmed}
        testId="story-cell"
      />
    </div>
  );
}

const meta: Meta<typeof Demo> = { title: "Data/ChallengePicker", component: Demo };
export default meta;
type Story = StoryObj<typeof Demo>;

export const Empty: Story = {};
export const Chosen: Story = { args: { value: "c2" } };
export const Dimmed: Story = { args: { value: "c1", dimmed: true } };
export const Disabled: Story = { args: { value: "c1", disabled: true } };
export const NothingAllowed: Story = { args: { allowed: [] } };
