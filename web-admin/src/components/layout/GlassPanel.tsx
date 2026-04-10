import { cn } from "@/lib/utils";
import { type HTMLAttributes, forwardRef } from "react";

export const GlassPanel = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "bg-card/95 backdrop-blur-xl border border-border rounded-xl",
      className,
    )}
    {...props}
  >
    {children}
  </div>
));
GlassPanel.displayName = "GlassPanel";
