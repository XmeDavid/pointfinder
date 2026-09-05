/* eslint-disable react-refresh/only-export-components */
/**
 * Re-export the existing toast system for v2 layout usage.
 *
 * The production codebase already has a Toaster component (`@/components/ui/toast`)
 * and a `useToast` hook (`@/hooks/useToast`). This barrel re-export provides a
 * shorter import path from the feedback directory.
 */
export { Toaster } from "@/components/ui/toast";
export { useToast } from "@/hooks/useToast";
export type { ToastVariant, Toast } from "@/hooks/useToast";
