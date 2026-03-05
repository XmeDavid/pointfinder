# Web Admin UI Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Comprehensive UI quality pass on the web-admin frontend covering accessibility, feedback systems, visual consistency, and polish.

**Architecture:** Improve existing component library with proper ARIA semantics, add new primitives (Alert, Toast, Skeleton), replace hardcoded colors with theme tokens, and enhance UX feedback patterns across all pages. No new dependencies — everything is built with React 19, Tailwind CSS v4.1, and existing utilities.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4.1, class-variance-authority, Zustand, i18next, Lucide icons.

**Note on testing:** This project has Vitest but no component test infrastructure (no jsdom, no @testing-library/react). Verification is done via `npm run lint && npm run build` after each task. Manual verification steps are noted where applicable.

---

## Task 1: Dialog Accessibility (ARIA, focus trap, scroll lock, Escape key)

**Files:**
- Modify: `web-admin/src/components/ui/dialog.tsx`

**Step 1: Rewrite Dialog with full accessibility**

Replace the dialog implementation with proper ARIA roles, focus trapping, body scroll lock, and Escape key handling.

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  // Lock body scroll when open
  React.useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" onClick={() => onOpenChange(false)} />
      <div className="fixed inset-0 flex items-center justify-center p-4" onClick={() => onOpenChange(false)}>
        {children}
      </div>
    </div>
  );
}

let dialogIdCounter = 0;

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { onClose?: () => void }
>(({ className, children, onClose, ...props }, ref) => {
  const [titleId] = React.useState(() => `dialog-title-${++dialogIdCounter}`);
  const internalRef = React.useRef<HTMLDivElement>(null);
  const combinedRef = (ref as React.RefObject<HTMLDivElement>) || internalRef;
  const containerRef = combinedRef || internalRef;

  // Focus trap
  React.useEffect(() => {
    const el = (containerRef as React.RefObject<HTMLDivElement>).current;
    if (!el) return;

    const focusable = el.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    // Auto-focus first focusable element
    first?.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [containerRef]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={cn(
        "relative z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg",
        className
      )}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      <DialogTitleIdContext.Provider value={titleId}>
        {children}
      </DialogTitleIdContext.Provider>
      {onClose && (
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
});
DialogContent.displayName = "DialogContent";

const DialogTitleIdContext = React.createContext<string>("");

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left mb-4", className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const titleId = React.useContext(DialogTitleIdContext);
  return <h2 id={titleId} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4", className)} {...props} />;
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter };
```

**Step 2: Verify**

Run: `cd web-admin && npm run lint && npm run build`
Expected: PASS (no API changes, all existing consumers work unchanged)

**Step 3: Commit**

```bash
git add web-admin/src/components/ui/dialog.tsx
git commit -m "feat(web): dialog accessibility — ARIA roles, focus trap, scroll lock, Escape key"
```

---

## Task 2: Tabs Accessibility (ARIA roles, keyboard navigation)

**Files:**
- Modify: `web-admin/src/components/ui/tabs.tsx`

**Step 1: Rewrite Tabs with ARIA and keyboard navigation**

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

let tabsIdCounter = 0;

function Tabs({ value, onValueChange, children, className }: TabsProps) {
  const [tabsId] = React.useState(() => `tabs-${++tabsIdCounter}`);
  return (
    <TabsContext.Provider value={{ value, onValueChange, tabsId }}>
      <div className={cn("", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

const TabsContext = React.createContext<{
  value: string;
  onValueChange: (value: string) => void;
  tabsId: string;
}>({ value: "", onValueChange: () => {}, tabsId: "" });

function TabsList({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { tabsId, onValueChange } = React.useContext(TabsContext);
  const ref = React.useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const el = ref.current;
    if (!el) return;
    const triggers = Array.from(
      el.querySelectorAll<HTMLButtonElement>(`[role="tab"]:not([disabled])`)
    );
    const current = triggers.findIndex((t) => t === document.activeElement);
    if (current === -1) return;

    let next = -1;
    if (e.key === "ArrowRight") next = (current + 1) % triggers.length;
    else if (e.key === "ArrowLeft") next = (current - 1 + triggers.length) % triggers.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = triggers.length - 1;

    if (next !== -1) {
      e.preventDefault();
      triggers[next].focus();
      onValueChange(triggers[next].dataset.value!);
    }
  };

  return (
    <div
      ref={ref}
      role="tablist"
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

function TabsTrigger({ className, value, ...props }: TabsTriggerProps) {
  const context = React.useContext(TabsContext);
  const isSelected = context.value === value;
  return (
    <button
      role="tab"
      aria-selected={isSelected}
      aria-controls={`${context.tabsId}-panel-${value}`}
      id={`${context.tabsId}-tab-${value}`}
      data-value={value}
      tabIndex={isSelected ? 0 : -1}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
        isSelected
          ? "bg-background text-foreground shadow-sm"
          : "hover:bg-background/50",
        className
      )}
      onClick={() => context.onValueChange(value)}
      {...props}
    />
  );
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

function TabsContent({ value, className, ...props }: TabsContentProps) {
  const context = React.useContext(TabsContext);
  if (context.value !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${context.tabsId}-panel-${value}`}
      aria-labelledby={`${context.tabsId}-tab-${value}`}
      tabIndex={0}
      className={cn("mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
```

**Step 2: Verify**

Run: `cd web-admin && npm run lint && npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add web-admin/src/components/ui/tabs.tsx
git commit -m "feat(web): tabs accessibility — ARIA roles, keyboard navigation, arrow keys"
```

---

## Task 3: Alert Component

**Files:**
- Create: `web-admin/src/components/ui/alert.tsx`

**Step 1: Create the Alert component**

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative flex items-start gap-3 rounded-md p-3 text-sm",
  {
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
  }
);

const alertIcons = {
  destructive: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  onDismiss?: () => void;
}

function Alert({ className, variant = "destructive", onDismiss, children, ...props }: AlertProps) {
  const Icon = alertIcons[variant ?? "destructive"];
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-sm p-0.5 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export { Alert, alertVariants };
```

**Step 2: Verify**

Run: `cd web-admin && npm run lint && npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add web-admin/src/components/ui/alert.tsx
git commit -m "feat(web): add Alert component with variants, icons, and dismiss"
```

---

## Task 4: Replace Inline Error Divs with Alert (19 files)

**Files to modify** (all contain `bg-destructive/10`):
- `web-admin/src/features/monitoring/MapPage.tsx`
- `web-admin/src/features/games/CreateGamePage.tsx`
- `web-admin/src/features/game-detail/ChallengesPage.tsx`
- `web-admin/src/features/game-detail/SettingsPage.tsx`
- `web-admin/src/features/game-detail/BasesPage.tsx`
- `web-admin/src/features/monitoring/SubmissionsPage.tsx`
- `web-admin/src/features/games/GamesListPage.tsx`
- `web-admin/src/features/game-detail/TeamsPage.tsx`
- `web-admin/src/features/game-detail/OverviewPage.tsx`
- `web-admin/src/features/auth/ForgotPasswordPage.tsx`
- `web-admin/src/features/auth/LoginPage.tsx`
- `web-admin/src/features/auth/ResetPasswordPage.tsx`
- `web-admin/src/features/monitoring/TeamDetailPage.tsx`
- `web-admin/src/features/admin/OperatorsPage.tsx`
- `web-admin/src/features/auth/RegisterPage.tsx`
- `web-admin/src/features/game-detail/NotificationsPage.tsx`
- `web-admin/src/features/monitoring/LeaderboardPage.tsx`
- `web-admin/src/features/monitoring/ActivityPage.tsx`
- `web-admin/src/features/monitoring/DashboardPage.tsx`

**Step 1: Replace all inline error patterns**

In each file, replace:
```tsx
<div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{errorMessage}</div>
```

With:
```tsx
import { Alert } from "@/components/ui/alert";
// ...
<Alert>{errorMessage}</Alert>
```

For pages that have `setActionError` state, add dismiss:
```tsx
<Alert onDismiss={() => setActionError("")}>{actionError}</Alert>
```

For websocket errors (non-dismissible, ActivityPage/DashboardPage/SubmissionsPage/MapPage/LeaderboardPage), keep without onDismiss:
```tsx
<Alert>{websocketError}</Alert>
```

**Step 2: Verify**

Run: `cd web-admin && npm run lint && npm run build`
Expected: PASS

**Step 3: Verify no remaining inline error patterns**

Run: `grep -r "bg-destructive/10" web-admin/src/`
Expected: No matches (or only the alert.tsx definition itself)

**Step 4: Commit**

```bash
git add web-admin/src/
git commit -m "refactor(web): replace 19 inline error divs with Alert component"
```

---

## Task 5: Toast Notification System

**Files:**
- Create: `web-admin/src/components/ui/toast.tsx`
- Create: `web-admin/src/hooks/useToast.ts`
- Modify: `web-admin/src/components/layout/AppShell.tsx` (add `<Toaster />`)

**Step 1: Create toast store with Zustand**

`web-admin/src/hooks/useToast.ts`:
```ts
import { create } from "zustand";

export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

let toastId = 0;

interface ToastStore {
  toasts: Toast[];
  addToast: (message: string, variant?: ToastVariant) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, variant = "info") => {
    const id = String(++toastId);
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function useToast() {
  const addToast = useToastStore((s) => s.addToast);
  return {
    success: (message: string) => addToast(message, "success"),
    error: (message: string) => addToast(message, "error"),
    info: (message: string) => addToast(message, "info"),
  };
}
```

**Step 2: Create Toaster UI component**

`web-admin/src/components/ui/toast.tsx`:
```tsx
import { CheckCircle, XCircle, Info, X } from "lucide-react";
import { useToastStore, type ToastVariant } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

const variantStyles: Record<ToastVariant, string> = {
  success: "border-success/30 bg-success/10 text-success",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-border bg-background text-foreground",
};

const variantIcons: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle className="h-4 w-4 shrink-0" />,
  error: <XCircle className="h-4 w-4 shrink-0" />,
  info: <Info className="h-4 w-4 shrink-0" />,
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-200",
            variantStyles[toast.variant]
          )}
        >
          {variantIcons[toast.variant]}
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="shrink-0 rounded-sm p-0.5 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
```

**Note:** Tailwind v4.1 includes `animate-in` / `slide-in-from-bottom-2` / `fade-in` via the built-in animation utilities. If these are not available, replace with a simple CSS animation in `index.css`:

```css
@keyframes toastSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.toast-enter { animation: toastSlideIn 0.2s ease-out; }
```

And use `className="toast-enter"` instead.

**Step 3: Add Toaster to AppShell**

In `web-admin/src/components/layout/AppShell.tsx`, add at the end of the outermost returned `<div>`:

```tsx
import { Toaster } from "@/components/ui/toast";
// At the end of the returned JSX, before closing </div>:
<Toaster />
```

Add `<Toaster />` at the end of each layout variant returned (classic, setup, monitor, review). The simplest approach: add it once at the bottom of the root component that wraps all layouts.

Check which component wraps all routes. If `AppShell` is the outermost for all pages, add it there. If auth pages bypass AppShell, also add `<Toaster />` to auth layout or the root `App.tsx`.

**Step 4: Verify**

Run: `cd web-admin && npm run lint && npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add web-admin/src/hooks/useToast.ts web-admin/src/components/ui/toast.tsx web-admin/src/components/layout/AppShell.tsx
git commit -m "feat(web): add toast notification system with Zustand store and Toaster component"
```

---

## Task 6: Add Toast Calls to Form Mutations

**Files to modify** (add success toasts to `onSuccess` callbacks):
- `web-admin/src/features/game-detail/BasesPage.tsx` — "Base created" / "Base updated" / "Base deleted"
- `web-admin/src/features/game-detail/ChallengesPage.tsx` — "Challenge created" / "Challenge updated" / "Challenge deleted"
- `web-admin/src/features/game-detail/TeamsPage.tsx` — "Team created" / "Team deleted"
- `web-admin/src/features/monitoring/SubmissionsPage.tsx` — "Submission approved" / "Submission rejected"

**Step 1: Add toasts to each page**

Pattern for each page:
```tsx
import { useToast } from "@/hooks/useToast";
// In component body:
const toast = useToast();
// In mutation onSuccess:
onSuccess: () => {
  // ... existing code ...
  toast.success(t("common.saved")); // or a specific key
},
```

Use the translation key `common.saved` for generic save, or use context-specific messages. Since i18n keys don't exist yet for these, use simple inline strings initially:

- BasesPage create: `toast.success(t("bases.createBase") + " ✓")` — actually, avoid emojis. Just use: `toast.success(t("common.saved"))`
- SubmissionsPage review: `toast.success(t("submissions.approve") + "d")` — or just `toast.success(t("common.saved"))`

Simplest approach: add `"saved": "Saved"` / `"deleted": "Deleted"` to `common` in all 3 locale files if not already present, then:
- Create/update mutations: `toast.success(t("common.saved"))`
- Delete mutations: `toast.success(t("common.deleted"))`
- Submission approve: `toast.success(t("submissions.statusApproved"))`
- Submission reject: `toast.success(t("submissions.statusRejected"))`

**Step 2: Add i18n keys if needed**

Check if `common.saved` and `common.deleted` already exist in en.json. If not, add to all 3 locale files:
- EN: `"saved": "Saved", "deleted": "Deleted"`
- PT: `"saved": "Guardado", "deleted": "Eliminado"`
- DE: `"saved": "Gespeichert", "deleted": "Gelöscht"`

**Step 3: Verify**

Run: `cd web-admin && npm run lint && npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add web-admin/src/features/ web-admin/src/i18n/
git commit -m "feat(web): add toast notifications on form success (create, update, delete, review)"
```

---

## Task 7: Skeleton Component

**Files:**
- Create: `web-admin/src/components/ui/skeleton.tsx`

**Step 1: Create Skeleton primitive**

```tsx
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
```

**Step 2: Verify**

Run: `cd web-admin && npm run lint && npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add web-admin/src/components/ui/skeleton.tsx
git commit -m "feat(web): add Skeleton primitive component"
```

---

## Task 8: Skeleton Loading States for Key Pages

**Files:**
- Modify: `web-admin/src/features/monitoring/DashboardPage.tsx`
- Modify: `web-admin/src/features/games/GamesListPage.tsx`
- Modify: `web-admin/src/features/monitoring/SubmissionsPage.tsx`

**Step 1: DashboardPage skeleton**

Replace `if (!stats || !game) return null;` with a skeleton layout:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

// Replace: if (!stats || !game) return null;
// With:
if (!stats || !game) {
  return (
    <div className="space-y-6">
      <div><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-32 mt-2" /></div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="flex items-center gap-3 p-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div><Skeleton className="h-7 w-12" /><Skeleton className="h-4 w-20 mt-1" /></div>
          </CardContent></Card>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}><CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, j) => <Skeleton key={j} className="h-4 w-full" />)}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: GamesListPage skeleton**

Replace the inline spinner with skeleton cards:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

// Replace the isLoading block:
if (isLoading) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-56 mt-2" /></div>
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <Skeleton className="h-6 w-36" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full mt-2" />
            </CardHeader>
            <CardContent><Skeleton className="h-4 w-48" /></CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: SubmissionsPage skeleton**

Add a skeleton state before the submissions list. Check if `submissions`, `teams`, `challenges`, or `bases` queries are loading:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

// Add queries' isLoading states (use `isLoading` from the submissions query):
const { data: submissions = [], isLoading: subsLoading } = useQuery({ ... });

// After the header, before the list:
if (subsLoading) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-32 mt-2" /></div>
        <div className="flex gap-2"><Skeleton className="h-9 w-20" /><Skeleton className="h-9 w-28" /></div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}><CardContent className="flex items-center gap-4 p-4">
            <div className="flex-1"><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-32 mt-2" /><Skeleton className="h-3 w-24 mt-1" /></div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}
```

**Step 4: Verify**

Run: `cd web-admin && npm run lint && npm run build`
Expected: PASS

**Step 5: Commit**

```bash
git add web-admin/src/features/monitoring/DashboardPage.tsx web-admin/src/features/games/GamesListPage.tsx web-admin/src/features/monitoring/SubmissionsPage.tsx
git commit -m "feat(web): add skeleton loading states for Dashboard, GamesList, and Submissions pages"
```

---

## Task 9: Theme Token Consistency (info + chart colors)

**Files:**
- Modify: `web-admin/src/index.css`
- Modify: `web-admin/src/components/ui/badge.tsx` (add `info` variant)
- Modify: `web-admin/src/features/monitoring/DashboardPage.tsx`
- Modify: `web-admin/src/features/monitoring/ActivityPage.tsx`

**Step 1: Add theme tokens to index.css**

Add to the `@theme` block (after `--color-success-foreground`):

```css
--color-info: #3b82f6;
--color-info-foreground: #ffffff;
--color-chart-1: #3b82f6;
--color-chart-2: #f59e0b;
--color-chart-3: #15803d;
--color-chart-4: #a855f7;
```

Add to the `.dark` block:

```css
--color-info: #60a5fa;
--color-info-foreground: #0a0a0a;
--color-chart-1: #60a5fa;
--color-chart-2: #fbbf24;
--color-chart-3: #22c55e;
--color-chart-4: #c084fc;
```

**Step 2: Add `info` variant to Badge**

In `badge.tsx`, add to the variants object:
```tsx
info: "border-transparent bg-info text-info-foreground",
```

**Step 3: Replace hardcoded colors in DashboardPage metric cards**

Replace the 4 metric card icon containers:

```tsx
// Teams (was blue-500)
<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-1/10"><Users className="h-5 w-5 text-chart-1" /></div>
// Pending (was yellow-500)
<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-2/10"><ClipboardCheck className="h-5 w-5 text-chart-2" /></div>
// Completed (was green-500)
<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-3/10"><CheckCircle2 className="h-5 w-5 text-chart-3" /></div>
// Time (was purple-500)
<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-4/10"><Clock className="h-5 w-5 text-chart-4" /></div>
```

**Step 4: Replace hardcoded colors in ActivityPage event icons**

```tsx
const EVENT_ICONS: Record<string, React.ReactNode> = {
  check_in: <MapPin className="h-4 w-4 text-chart-1" />,
  submission: <ClipboardCheck className="h-4 w-4 text-chart-2" />,
  approval: <CheckCircle className="h-4 w-4 text-chart-3" />,
  rejection: <XCircle className="h-4 w-4 text-destructive" />,
};
```

**Step 5: Replace hardcoded icon color in BasesPage base list**

Line 146: replace `bg-blue-500/10` and `text-blue-500` with `bg-chart-1/10` and `text-chart-1`.

**Step 6: Verify**

Run: `cd web-admin && npm run lint && npm run build`
Expected: PASS

Run: `grep -r "text-blue-500\|bg-blue-500\|text-yellow-500\|bg-yellow-500\|text-purple-500\|bg-purple-500\|text-red-500\|bg-red-500" web-admin/src/features/`
Expected: No matches in the files we modified (some may remain in other files — that's OK for this pass)

**Step 7: Commit**

```bash
git add web-admin/src/index.css web-admin/src/components/ui/badge.tsx web-admin/src/features/monitoring/DashboardPage.tsx web-admin/src/features/monitoring/ActivityPage.tsx web-admin/src/features/game-detail/BasesPage.tsx
git commit -m "feat(web): add info/chart theme tokens, replace hardcoded colors with theme variables"
```

---

## Task 10: Loading Button States

**Files:**
- Modify: `web-admin/src/components/ui/button.tsx` (add `loading` prop)

**Step 1: Add loading prop to Button**

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent shrink-0" />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants };
```

**Step 2: Use loading prop on form submit buttons**

Update key form buttons across pages. Replace `disabled={mutation.isPending}` with `loading={mutation.isPending}`:

Files to update (submit buttons only — not icon buttons):
- `BasesPage.tsx` line 278: `<Button type="submit" loading={createBase.isPending || updateBase.isPending}>`
- `ChallengesPage.tsx` line 449: `<Button type="submit" loading={createChallenge.isPending || updateChallenge.isPending}>`
- `TeamsPage.tsx` line 132: `<Button type="submit" loading={createTeam.isPending}>`
- `SubmissionsPage.tsx` lines 190-191: `<Button ... loading={reviewMutation.isPending}>`
- `GamesListPage.tsx` line 276: `<Button type="submit" loading={importing}>`

**Step 3: Verify**

Run: `cd web-admin && npm run lint && npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add web-admin/src/components/ui/button.tsx web-admin/src/features/
git commit -m "feat(web): add loading prop to Button, show spinner during form submissions"
```

---

## Task 11: Truncation Tooltips

**Files:**
- Modify: `web-admin/src/features/game-detail/BasesPage.tsx`
- Modify: `web-admin/src/features/monitoring/SubmissionsPage.tsx`
- Modify: `web-admin/src/features/game-detail/ChallengesPage.tsx`

**Step 1: Add title attributes to truncated text**

BasesPage line 164 — base description:
```tsx
<p className="text-sm text-muted-foreground truncate" title={base.description}>{base.description}</p>
```

SubmissionsPage line 122 — answer text:
```tsx
<span className="truncate max-w-xs text-xs" title={sub.answer ?? undefined}>{sub.answer}</span>
```

SubmissionsPage line 128 — feedback text:
```tsx
<p className="text-xs text-muted-foreground mt-1 truncate max-w-xl" title={sub.feedback ?? undefined}>
```

ChallengesPage line 187 — card description:
```tsx
<CardDescription className="line-clamp-1" title={ch.description}>{ch.description}</CardDescription>
```

**Step 2: Verify**

Run: `cd web-admin && npm run lint && npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add web-admin/src/features/game-detail/BasesPage.tsx web-admin/src/features/monitoring/SubmissionsPage.tsx web-admin/src/features/game-detail/ChallengesPage.tsx
git commit -m "feat(web): add title tooltips to truncated text (descriptions, feedback, answers)"
```

---

## Task 12: Activity Event Type Localization

**Files:**
- Modify: `web-admin/src/i18n/locales/en.json`
- Modify: `web-admin/src/i18n/locales/pt.json`
- Modify: `web-admin/src/i18n/locales/de.json`
- Modify: `web-admin/src/features/monitoring/ActivityPage.tsx`

**Step 1: Add i18n keys for event types**

In each locale file, add to the `activityFeed` section:

EN:
```json
"eventType": {
  "check_in": "Check-in",
  "submission": "Submission",
  "approval": "Approval",
  "rejection": "Rejection"
}
```

PT:
```json
"eventType": {
  "check_in": "Check-in",
  "submission": "Submissão",
  "approval": "Aprovação",
  "rejection": "Rejeição"
}
```

DE:
```json
"eventType": {
  "check_in": "Check-in",
  "submission": "Einreichung",
  "approval": "Freigabe",
  "rejection": "Ablehnung"
}
```

**Step 2: Update ActivityPage**

Replace line 42:
```tsx
// Before:
<Badge variant="outline" className="text-xs capitalize">{event.type.replace("_", " ")}</Badge>
// After:
<Badge variant="outline" className="text-xs">{t(`activityFeed.eventType.${event.type}`, { defaultValue: event.type.replace("_", " ") })}</Badge>
```

The `defaultValue` fallback handles any unknown event types gracefully.

**Step 3: Verify**

Run: `cd web-admin && npm run lint && npm run build`
Expected: PASS

**Step 4: Commit**

```bash
git add web-admin/src/i18n/locales/ web-admin/src/features/monitoring/ActivityPage.tsx
git commit -m "feat(web): localize activity event type labels (EN, PT, DE)"
```

---

## Task 13: Minor ARIA Fixes

**Files:**
- Modify: `web-admin/src/features/game-detail/BasesPage.tsx`
- Modify: `web-admin/src/features/game-detail/ChallengesPage.tsx`
- Modify: `web-admin/src/features/game-detail/TeamsPage.tsx`

**Step 1: Add aria-labels to icon-only buttons**

BasesPage lines 173-174 (edit/delete buttons):
```tsx
<Button variant="ghost" size="icon" onClick={() => openEdit(base)} aria-label={t("common.edit")}><Pencil className="h-4 w-4" /></Button>
<Button variant="ghost" size="icon" onClick={() => setDeleteTarget(base.id)} aria-label={t("common.delete")}><Trash2 className="h-4 w-4 text-destructive" /></Button>
```

ChallengesPage lines 189-190:
```tsx
<Button variant="ghost" size="icon" onClick={() => openEdit(ch)} aria-label={t("common.edit")}><Pencil className="h-4 w-4" /></Button>
<Button variant="ghost" size="icon" onClick={() => setDeleteTarget(ch.id)} aria-label={t("common.delete")}><Trash2 className="h-4 w-4 text-destructive" /></Button>
```

TeamsPage line 246:
```tsx
<Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label={t("common.delete")}>
```

**Step 2: Verify**

Run: `cd web-admin && npm run lint && npm run build`
Expected: PASS

**Step 3: Commit**

```bash
git add web-admin/src/features/game-detail/
git commit -m "feat(web): add aria-labels to icon-only edit/delete buttons"
```

---

## Final Verification

**Step 1: Full lint + build**

Run: `cd web-admin && npm run lint && npm run build`
Expected: PASS with no warnings

**Step 2: Manual smoke test checklist**

Run `npm run dev` and verify:
- [ ] Open a dialog → focus is trapped, Escape closes, background doesn't scroll
- [ ] Tab through dialog → focus cycles within dialog
- [ ] Use arrow keys on Tabs component → tabs switch
- [ ] Error alerts show icon and dismiss button
- [ ] Create/edit a base → toast appears on success
- [ ] Dashboard shows skeleton while loading (throttle network in DevTools)
- [ ] Games list shows skeleton cards while loading
- [ ] Metric cards use theme colors (check dark mode too)
- [ ] Activity page shows translated event types
- [ ] Hover truncated descriptions → native tooltip shows full text
- [ ] Submit buttons show spinner while saving
- [ ] Screen reader: dialog announces as dialog, tabs announce as tabs
