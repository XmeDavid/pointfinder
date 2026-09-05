import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusMarker, TeamLocationMarker } from "@/components/map/StatusMarker";
import { baseStatusMarkerTone, type BaseStatus } from "@/components/map/markerStyles";

const meta: Meta<typeof StatusMarker> = {
  title: "Core/Map/StatusMarker",
  component: StatusMarker,
  args: { tone: "success", size: 14, selected: false, dashed: false, label: "Granite boulder" },
  argTypes: { tone: { control: "select", options: ["success", "info", "warning", "destructive", "muted", "hidden"] } },
};
export default meta;
type Story = StoryObj<typeof StatusMarker>;

export const Playground: Story = {};

export const ByBaseStatus: Story = {
  render: () => (
    <div className="flex flex-wrap items-end gap-6 rounded-lg bg-[var(--pf-color-surface-map)] p-6">
      {(Object.keys(baseStatusMarkerTone) as BaseStatus[]).map((s) => (
        <StatusMarker key={s} tone={baseStatusMarkerTone[s]} label={s.replace("_", " ")} />
      ))}
      <StatusMarker tone="destructive" dashed label="no tag" />
      <StatusMarker tone="success" selected size={18} label="selected" />
      <TeamLocationMarker />
      <TeamLocationMarker stale />
    </div>
  ),
};
