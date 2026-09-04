/**
 * Re-export the existing ConfirmDeleteDialog as ConfirmDialog for v2 layout usage.
 *
 * The production codebase already has a full-featured confirm dialog at
 * `@pointfinder/core/ui/confirm-dialog`. This barrel re-export provides a
 * shorter import path for the new layout components while keeping a single
 * source of truth.
 */
export { ConfirmDeleteDialog as ConfirmDialog } from "@pointfinder/core/ui/confirm-dialog";
