import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

// ---- Context for sharing the title ID between DialogContent and DialogTitle ----
const DialogContext = React.createContext<{
  titleId: string;
}>({ titleId: "" });

// ---- Focusable-element selector used by the focus trap ----
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  const titleId = React.useId();

  // Lock body scroll while the dialog is open
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape key
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <DialogContext.Provider value={{ titleId }}>
      <div className="fixed inset-0 z-50">
        <div
          className="fixed inset-0 bg-black/50"
          aria-hidden="true"
          onClick={() => onOpenChange(false)}
        />
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          onClick={() => onOpenChange(false)}
        >
          {children}
        </div>
      </div>
    </DialogContext.Provider>
  );
}

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { onClose?: () => void }
>(({ className, children, onClose, ...props }, ref) => {
  const { titleId } = React.useContext(DialogContext);
  const internalRef = React.useRef<HTMLDivElement>(null);

  // Merge forwarded ref and internal ref
  const mergedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      (internalRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [ref],
  );

  // Auto-focus first focusable element on mount
  React.useEffect(() => {
    const container = internalRef.current;
    if (!container) return;
    const first = container.querySelector<HTMLElement>(FOCUSABLE);
    if (first) {
      first.focus();
    } else {
      // If there are no focusable elements, focus the container itself
      container.focus();
    }
  }, []);

  // Focus trap – cycle Tab through focusable elements inside the dialog
  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const container = internalRef.current;
    if (!container) return;

    const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  return (
    <div
      ref={mergedRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={cn(
        "relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {children}
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
});
DialogContent.displayName = "DialogContent";

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left mb-4", className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const { titleId } = React.useContext(DialogContext);
  return <h2 id={titleId} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4", className)} {...props} />;
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter };
