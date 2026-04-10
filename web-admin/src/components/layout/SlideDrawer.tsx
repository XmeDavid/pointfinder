import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface SlideDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Desktop width class, e.g. "w-96" or "w-[480px]". Defaults to "w-96".
   *  On mobile (<md), the drawer is always full-width. */
  width?: string;
  className?: string;
  title?: string;
}

const overlay = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
} as const;

const panel = {
  initial: { x: "100%" },
  animate: { x: 0 },
  exit: { x: "100%" },
  transition: { type: "spring", damping: 30, stiffness: 300 },
} as const;

export function SlideDrawer({
  open,
  onClose,
  children,
  width = "md:w-96",
  className,
  title,
}: SlideDrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" data-testid="slide-drawer">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
            {...overlay}
          />

          {/* Panel */}
          <motion.div
            className={cn(
              "absolute right-0 top-0 bottom-0 flex flex-col bg-card border-l border-border shadow-xl",
              "w-full",
              width,
              className,
            )}
            {...panel}
          >
            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-2 md:hidden">
              <div className="h-1 w-8 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Header -- only rendered when a title is provided */}
            {title && (
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground truncate">
                  {title}
                </h2>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                  aria-label="Close"
                  data-testid="slide-drawer-close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
