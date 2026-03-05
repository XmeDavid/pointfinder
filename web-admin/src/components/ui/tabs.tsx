import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  tabsId: string;
}

const TabsContext = React.createContext<TabsContextValue>({
  value: "",
  onValueChange: () => {},
  tabsId: "",
});

// ---------------------------------------------------------------------------
// Tabs (root)
// ---------------------------------------------------------------------------

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

function Tabs({ value, onValueChange, children, className }: TabsProps) {
  const tabsId = React.useId();

  const ctx = React.useMemo<TabsContextValue>(
    () => ({ value, onValueChange, tabsId }),
    [value, onValueChange, tabsId],
  );

  return (
    <TabsContext.Provider value={ctx}>
      <div className={cn("", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// TabsList
// ---------------------------------------------------------------------------

function TabsList({
  className,
  onKeyDown,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { onValueChange } = React.useContext(TabsContext);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;

      const list = e.currentTarget;
      const triggers = Array.from(
        list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'),
      );
      if (triggers.length === 0) return;

      const currentIndex = triggers.findIndex(
        (t) => t === document.activeElement,
      );

      let nextIndex: number | null = null;

      switch (e.key) {
        case "ArrowRight":
          nextIndex =
            currentIndex < triggers.length - 1 ? currentIndex + 1 : 0;
          break;
        case "ArrowLeft":
          nextIndex =
            currentIndex > 0 ? currentIndex - 1 : triggers.length - 1;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = triggers.length - 1;
          break;
        default:
          return; // don't prevent default for unhandled keys
      }

      e.preventDefault();
      const next = triggers[nextIndex];
      next.focus();

      // Arrow keys / Home / End move focus AND activate the tab
      const tabValue = next.getAttribute("data-value");
      if (tabValue != null) {
        onValueChange(tabValue);
      }
    },
    [onValueChange, onKeyDown],
  );

  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        className,
      )}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// TabsTrigger
// ---------------------------------------------------------------------------

interface TabsTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

function TabsTrigger({ className, value, ...props }: TabsTriggerProps) {
  const { value: selectedValue, onValueChange, tabsId } =
    React.useContext(TabsContext);
  const isSelected = selectedValue === value;

  return (
    <button
      role="tab"
      aria-selected={isSelected}
      aria-controls={`${tabsId}-content-${value}`}
      data-value={value}
      tabIndex={isSelected ? 0 : -1}
      id={`${tabsId}-trigger-${value}`}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        isSelected
          ? "bg-background text-foreground shadow-sm"
          : "hover:bg-background/50",
        className,
      )}
      onClick={() => onValueChange(value)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// TabsContent
// ---------------------------------------------------------------------------

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

function TabsContent({ value, className, ...props }: TabsContentProps) {
  const { value: selectedValue, tabsId } = React.useContext(TabsContext);
  if (selectedValue !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${tabsId}-content-${value}`}
      aria-labelledby={`${tabsId}-trigger-${value}`}
      tabIndex={0}
      className={cn("mt-2", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
