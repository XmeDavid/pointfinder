import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva("flex items-start gap-3 rounded-md p-3 text-sm", {
  variants: {
    variant: {
      destructive: "bg-destructive/10 text-destructive",
      warning: "bg-warning/10 text-warning",
      info: "bg-info/10 text-info",
    },
  },
  defaultVariants: {
    variant: "destructive",
  },
});

const variantIcons = {
  destructive: AlertCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  onDismiss?: () => void;
}

function Alert({ className, variant, onDismiss, children, ...props }: AlertProps) {
  const resolvedVariant = variant ?? "destructive";
  const Icon = variantIcons[resolvedVariant];

  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export { Alert, alertVariants };
