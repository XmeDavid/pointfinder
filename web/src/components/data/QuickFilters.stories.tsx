import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { QuickFilters, type QuickFilterGroup } from "./QuickFilters";

const stages = [
  { id: "s1", label: "Morning loop" },
  { id: "s2", label: "Afternoon ascent" },
  { id: "none", label: "No stage" },
];
const tags = [
  { id: "t1", label: "Outdoor", color: "#16a34a" },
  { id: "t2", label: "Photo", color: "#eab308" },
  { id: "t3", label: "Needs a torch after dark", color: "#7c3aed" },
];

function Demo({ withStages = true, withTags = true, initialStage = [] as string[], initialTags = [] as string[] }) {
  const [stage, setStage] = useState<string[]>(initialStage);
  const [tag, setTag] = useState<string[]>(initialTags);
  const groups: QuickFilterGroup[] = [
    { id: "stage", label: "Stage", mode: "single", options: withStages ? stages : [], value: stage, onChange: setStage },
    { id: "tag", label: "Tags", mode: "multi", options: withTags ? tags : [], value: tag, onChange: setTag },
  ];
  return (
    <div className="max-w-xs rounded-md border border-border p-2">
      <QuickFilters groups={groups} />
    </div>
  );
}

const meta: Meta<typeof Demo> = { title: "Data/QuickFilters", component: Demo };
export default meta;
type Story = StoryObj<typeof Demo>;

export const StagesAndTags: Story = {};
export const StageChosen: Story = { args: { initialStage: ["s2"] } };
export const TagsChosen: Story = { args: { initialTags: ["t1", "t3"] } };
export const TagsOnly: Story = { args: { withStages: false } };
export const NothingToFilter: Story = { args: { withStages: false, withTags: false } };
