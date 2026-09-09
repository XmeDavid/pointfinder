import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { BillingCycleToggle } from "@/components/ui/billing-cycle-toggle";
import type { BillingCycleOption } from "@/lib/pricing";

const meta: Meta<typeof BillingCycleToggle> = {
  title: "Core/BillingCycleToggle",
  component: BillingCycleToggle,
  args: {
    value: "monthly",
    label: "Billing cycle",
    monthlyLabel: "Monthly",
    yearlyLabel: "Yearly",
  },
};
export default meta;
type Story = StoryObj<typeof BillingCycleToggle>;

export const Playground: Story = {
  render: function Render(args) {
    const [cycle, setCycle] = useState<BillingCycleOption>(args.value);
    return <BillingCycleToggle {...args} value={cycle} onChange={setCycle} />;
  },
};

export const Yearly: Story = { args: { value: "yearly", onChange: () => {} } };

export const LongGermanLabels: Story = {
  args: {
    value: "monthly",
    label: "Abrechnungszeitraum",
    monthlyLabel: "Monatlich",
    yearlyLabel: "Jährlich",
    onChange: () => {},
  },
};
