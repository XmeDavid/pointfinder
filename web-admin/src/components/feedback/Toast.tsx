/* eslint-disable react-refresh/only-export-components */
/**
 * Re-export the existing toast system for v2 layout usage.
 *
 * The production codebase already has a Toaster component (`@pointfinder/core/ui/toast`)
 * and a `useToast` hook (`@pointfinder/core/hooks/useToast`). This barrel re-export provides a
 * shorter import path from the feedback directory.
 */
export { Toaster } from "@pointfinder/core/ui/toast";
export { useToast } from "@pointfinder/core/hooks/useToast";
export type { ToastVariant, Toast } from "@pointfinder/core/hooks/useToast";
