import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrandLockup, BrandMark, BrandTile } from "./BrandMark";

const meta: Meta<typeof BrandMark> = {
  title: "Brand/BrandMark",
  component: BrandMark,
  args: { size: 48, tone: "brand", decorative: false },
  argTypes: {
    tone: { control: "select", options: ["brand", "current"] },
    size: { control: { type: "number", min: 12, max: 256 } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "The approved PointFinder mark from `design-system/brand/pointfinder-mark.svg`, generated into `web/src/generated/brandMark.ts`. Switch the toolbar theme to review the positive (light) and reversed (dark) one-color treatments.",
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof BrandMark>;

export const MarkAlone: Story = {};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-end gap-6">
      {[16, 24, 32, 48, 96].map((size) => (
        <figure key={size} className="flex flex-col items-center gap-2">
          <BrandMark size={size} />
          <figcaption className="text-xs text-muted-foreground">{size}px</figcaption>
        </figure>
      ))}
    </div>
  ),
  parameters: { docs: { description: { story: "Start with the master at every size. At 16 px the winding path closes up; inspect favicon exports at actual display size before proposing any optical correction." } } },
};

export const WithWordmark: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <BrandLockup />
      <BrandLockup size={32} textClassName="text-lg" />
    </div>
  ),
};

export const Tile: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      <BrandTile size={24} />
      <BrandTile size={48} />
      <BrandTile size={96} className="rounded-xl" />
    </div>
  ),
  parameters: { docs: { description: { story: "Reversed treatment on the forest-green brand tile: the same placement as the launcher exports (mark frame at 80% of the tile)." } } },
};

export const Reversed: Story = {
  render: () => (
    <div className="flex items-center gap-6 rounded-lg bg-foreground p-6 text-background">
      <BrandMark size={48} tone="current" />
      <BrandLockup size={28} tone="current" textClassName="text-lg" />
    </div>
  ),
  parameters: { docs: { description: { story: "`tone=\"current\"` inherits the surrounding text color for contrasting or photographic backgrounds; the path and light stay open so the background shows through." } } },
};

export const Decorative: Story = {
  args: { decorative: true },
  parameters: { docs: { description: { story: "Hidden from assistive technology when an adjacent wordmark or the containing link already says PointFinder." } } },
};
