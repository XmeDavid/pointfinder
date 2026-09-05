import * as React from "react";
import { createPortal } from 'react-dom';
import { cn } from "@/lib/utils/cn";

interface DropdownMenuProps {
  children: React.ReactNode;
}

interface DropdownContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
  anchor?: React.RefObject<HTMLDivElement | null>;
}

const DropdownContext = React.createContext<DropdownContextType>({
  open: false,
  setOpen: () => {},
});

function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  const anchor = React.useRef<HTMLDivElement>(null);
  return (
    <DropdownContext.Provider value={{ open, setOpen, anchor }}>
      <div ref={anchor} className="relative inline-block min-w-0 text-left">{children}</div>
    </DropdownContext.Provider>
  );
}

function DropdownMenuTrigger({ children, className, asChild, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const { open, setOpen } = React.useContext(DropdownContext);

  if (asChild && React.isValidElement<{ onClick?: (e: React.MouseEvent) => void }>(children)) {
    return React.cloneElement(children, {
      onClick: (e: React.MouseEvent) => {
        setOpen(!open);
        children.props.onClick?.(e);
      },
    });
  }

  return (
    <button
      type="button"
      {...props}
      onClick={(e) => {
        setOpen(!open);
        props.onClick?.(e);
      }}
      className={cn("cursor-pointer", className)}
    >
      {children}
    </button>
  );
}

function DropdownMenuContent({ children, className, align = "end", portal = false }: { children: React.ReactNode; className?: string; align?: "start" | "end"; portal?: boolean }) {
  const { open, setOpen, anchor } = React.useContext(DropdownContext);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-dropdown]")) {
        setOpen(false);
      }
    };
    document.addEventListener("click", handler, { capture: true });
    return () => document.removeEventListener("click", handler, { capture: true });
  }, [open, setOpen]);

  if (!open) return null;
  if (portal && anchor) return <FloatingMenu anchor={anchor} className={className}>{children}</FloatingMenu>;
  return (
    <div
      data-dropdown
      className={cn(
        "absolute z-50 mt-1 min-w-[8rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
        align === "end" ? "right-0" : "left-0",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Profile menus escape the scrolling rail and stay inside the phone viewport. */
function FloatingMenu({ anchor, children, className }: { anchor: React.RefObject<HTMLDivElement | null>; children: React.ReactNode; className?: string }) {
  const menu = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ left: 0, top: 0 });
  React.useLayoutEffect(() => {
    const update = () => {
      const button = anchor.current?.getBoundingClientRect();
      const box = menu.current?.getBoundingClientRect();
      if (!button || !box) return;
      setPosition({ left: button.right - box.width, top: button.top - box.height - 8 });
    };
    update();
    const observer = new ResizeObserver(update);
    if (menu.current) observer.observe(menu.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [anchor]);
  return createPortal(<div ref={menu} data-dropdown className={cn('fixed z-[60] w-56 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md', className)} style={{
    maxWidth: 'calc(100vw - var(--safe-left) - var(--safe-right) - 16px)',
    maxHeight: 'calc(100dvh - var(--safe-top) - var(--safe-bottom) - 16px)',
    left: `clamp(calc(var(--safe-left) + 8px), ${position.left}px, calc(100vw - var(--safe-right) - 8px - 14rem))`,
    top: `max(calc(var(--safe-top) + 8px), ${position.top}px)`,
  }}>{children}</div>, document.body);
}

function DropdownMenuItem({
  children,
  className,
  onClick,
  destructive,
  disabled,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  'data-testid'?: string;
}) {
  const { setOpen } = React.useContext(DropdownContext);
  return (
    <button
      type="button"
      {...props}
      disabled={disabled}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
        destructive && "text-destructive hover:text-destructive",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      onClick={() => {
        onClick?.();
        setOpen(false);
      }}
    >
      {children}
    </button>
  );
}

function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div className={cn("-mx-1 my-1 h-px bg-border", className)} />;
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator };
