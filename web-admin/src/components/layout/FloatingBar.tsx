import { GlassPanel } from "./GlassPanel";
import { cn } from "@/lib/utils";

export function FloatingBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "absolute top-3 left-3 right-3 z-30 pointer-events-none",
        className,
      )}
    >
      <GlassPanel className="pointer-events-auto px-2 py-1.5 flex items-center gap-2 rounded-xl">
        {children}
      </GlassPanel>
    </div>
  );
}
