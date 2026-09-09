import { cn } from "@/lib/utils/cn";
import type { BillingCycleOption } from "@/lib/pricing";

interface BillingCycleToggleProps {
  value: BillingCycleOption;
  onChange: (value: BillingCycleOption) => void;
  /** Accessible name for the group, e.g. "Billing cycle". */
  label: string;
  monthlyLabel: string;
  yearlyLabel: string;
  className?: string;
}

/**
 * Two-option segmented control for choosing a billing cycle. Shared by the
 * public pricing section and the operator billing tab so both offer the same
 * choice with the same affordance.
 */
export function BillingCycleToggle({
  value,
  onChange,
  label,
  monthlyLabel,
  yearlyLabel,
  className,
}: BillingCycleToggleProps) {
  const options: { value: BillingCycleOption; label: string }[] = [
    { value: "monthly", label: monthlyLabel },
    { value: "yearly", label: yearlyLabel },
  ];
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "grid w-fit grid-cols-2 rounded-md border border-border bg-muted p-0.5 text-xs",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={cn(
            "rounded-sm px-2.5 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
