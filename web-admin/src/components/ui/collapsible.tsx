import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface CollapsibleProps {
  title: ReactNode;
  icon?: ReactNode;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function Collapsible({ title, icon, description, defaultOpen = false, children, className }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={className}>
      <button
        type="button"
        className="flex w-full items-center gap-2 py-2 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
        {icon}
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium leading-none">{title}</span>
          {description && !open && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
          )}
        </div>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden px-px pb-px">
          {description && open && (
            <p className="text-xs text-muted-foreground mb-2">{description}</p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
