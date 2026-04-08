/**
 * ManageTagsDialog — operator UI for creating, editing, and deleting
 * game-scoped tags (Wave B tags+colors unification).
 *
 * Privacy: tags are operator-only. This component must never be rendered
 * on any player-facing route.
 */

import { useState } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Tags, Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-dialog";
import { tagsApi, type CreateTagDto, type UpdateTagDto } from "@/lib/api/tags";
import { COLOR_PALETTE, pickNextDefaultColor } from "@/lib/colorPalette";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useToast } from "@/hooks/useToast";
import type { Tag } from "@/types";

// ---------------------------------------------------------------------------
// Inline color picker swatch strip (minimal, no external dep)
// ---------------------------------------------------------------------------

interface InlineColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

function InlineColorPicker({ value, onChange }: InlineColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLOR_PALETTE.map((swatch) => (
        <button
          key={swatch.value}
          type="button"
          title={swatch.value}
          aria-label={swatch.value}
          onClick={() => onChange(swatch.value)}
          className={[
            "h-5 w-5 rounded-full border-2 transition-all",
            value.toLowerCase() === swatch.value.toLowerCase()
              ? "border-foreground ring-1 ring-foreground ring-offset-1 scale-110"
              : "border-transparent hover:border-foreground/50",
          ].join(" ")}
          style={{ backgroundColor: swatch.value }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tag row — view mode
// ---------------------------------------------------------------------------

interface TagRowProps {
  tag: Tag;
  onEdit: () => void;
  onDelete: () => void;
}

function TagRow({ tag, onEdit, onDelete }: TagRowProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3 rounded-md border border-border p-2">
      <span
        className="h-4 w-4 rounded-full shrink-0 border border-border/50"
        style={{ backgroundColor: tag.color }}
        aria-hidden="true"
      />
      <span className="flex-1 text-sm font-medium truncate" data-testid={`tag-label-${tag.id}`}>
        {tag.label}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onEdit}
          aria-label={t("common.edit")}
          data-testid={`tag-edit-btn-${tag.id}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onDelete}
          aria-label={t("common.delete")}
          data-testid={`tag-delete-btn-${tag.id}`}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tag row — edit mode
// ---------------------------------------------------------------------------

interface EditTagRowProps {
  initialLabel: string;
  initialColor: string;
  onSave: (label: string, color: string) => void;
  onCancel: () => void;
  isSaving: boolean;
  error?: string;
  labelPlaceholder: string;
}

function EditTagRow({
  initialLabel,
  initialColor,
  onSave,
  onCancel,
  isSaving,
  error,
  labelPlaceholder,
}: EditTagRowProps) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(initialLabel);
  const [color, setColor] = useState(initialColor);

  return (
    <div className="space-y-2 rounded-md border border-primary/50 bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <span
          className="h-4 w-4 rounded-full shrink-0 border border-border/50"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={labelPlaceholder}
          className="h-7 text-sm"
          maxLength={40}
          data-testid="tag-label-edit-input"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const trimmed = label.trim();
              if (trimmed) onSave(trimmed, color);
            }
            if (e.key === "Escape") onCancel();
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => {
            const trimmed = label.trim();
            if (trimmed) onSave(trimmed, color);
          }}
          disabled={isSaving || !label.trim()}
          aria-label={t("common.save")}
          data-testid="tag-save-btn"
        >
          <Check className="h-3.5 w-3.5 text-primary" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onCancel}
          aria-label={t("common.cancel")}
          data-testid="tag-cancel-btn"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <InlineColorPicker value={color} onChange={setColor} />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

interface ManageTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameId: string;
}

export function ManageTagsDialog({ open, onOpenChange, gameId }: ManageTagsDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ["tags", gameId],
    queryFn: () => tagsApi.listByGame(gameId),
    enabled: open && !!gameId,
    staleTime: 0,
  });

  // editingId: null = not editing, "new" = adding new, tagId = editing existing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["tags", gameId] });
    // Invalidate bases and challenges too so tag chip rendering updates
    queryClient.invalidateQueries({ queryKey: ["bases", gameId] });
    queryClient.invalidateQueries({ queryKey: ["challenges", gameId] });
  };

  const createTag = useMutation({
    mutationFn: (dto: CreateTagDto) => tagsApi.createTag(gameId, dto),
    onSuccess: () => {
      setEditingId(null);
      setEditError("");
      invalidate();
      toast.success(t("common.saved"));
    },
    onError: (error: unknown) => {
      const msg = getApiErrorMessage(error);
      // Map well-known backend errors to i18n keys
      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("already exists")) {
        setEditError(t("manageTagsDialog.duplicateLabelError"));
      } else if (msg.toLowerCase().includes("maximum") || msg.toLowerCase().includes("50")) {
        setEditError(t("manageTagsDialog.capExceeded"));
      } else {
        setEditError(msg);
      }
    },
  });

  const updateTag = useMutation({
    mutationFn: ({ tagId, dto }: { tagId: string; dto: UpdateTagDto }) =>
      tagsApi.updateTag(gameId, tagId, dto),
    onSuccess: () => {
      setEditingId(null);
      setEditError("");
      invalidate();
      toast.success(t("common.saved"));
    },
    onError: (error: unknown) => {
      const msg = getApiErrorMessage(error);
      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("already exists")) {
        setEditError(t("manageTagsDialog.duplicateLabelError"));
      } else {
        setEditError(msg);
      }
    },
  });

  const deleteTag = useMutation({
    mutationFn: (tagId: string) => tagsApi.deleteTag(gameId, tagId),
    onSuccess: () => {
      setDeleteTarget(null);
      invalidate();
      toast.success(t("common.deleted"));
    },
    onError: (error: unknown) => {
      setDeleteTarget(null);
      const msg = getApiErrorMessage(error);
      // 409 = tag is in use; surface a helpful toast
      if (msg.toLowerCase().includes("in use") || msg.toLowerCase().includes("409") || msg.toLowerCase().includes("conflict")) {
        toast.error(t("manageTagsDialog.deleteInUseError"));
      } else {
        toast.error(msg);
      }
    },
  });

  function handleAddNew() {
    setEditError("");
    setEditingId("new");
  }

  function handleSaveNew(label: string, color: string) {
    createTag.mutate({ label, color });
  }

  function handleSaveExisting(tagId: string, label: string, color: string) {
    updateTag.mutate({ tagId, dto: { label, color } });
  }

  function handleStartEdit(tagId: string) {
    setEditError("");
    setEditingId(tagId);
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditError("");
  }

  const existingColors = tags.map((t) => t.color);
  const newTagDefaultColor = pickNextDefaultColor(existingColors);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md" data-testid="manage-tags-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tags className="h-4 w-4" />
              {t("manageTagsDialog.title")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ) : tags.length === 0 && editingId !== "new" ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("manageTagsDialog.noTags")}
              </p>
            ) : (
              <div className="space-y-2">
                {tags.map((tag) =>
                  editingId === tag.id ? (
                    <EditTagRow
                      key={tag.id}
                      initialLabel={tag.label}
                      initialColor={tag.color}
                      onSave={(label, color) => handleSaveExisting(tag.id, label, color)}
                      onCancel={handleCancelEdit}
                      isSaving={updateTag.isPending}
                      error={editError}
                      labelPlaceholder={t("manageTagsDialog.labelPlaceholder")}
                    />
                  ) : (
                    <TagRow
                      key={tag.id}
                      tag={tag}
                      onEdit={() => handleStartEdit(tag.id)}
                      onDelete={() => setDeleteTarget(tag)}
                    />
                  ),
                )}
              </div>
            )}

            {/* New tag inline form */}
            {editingId === "new" && (
              <EditTagRow
                initialLabel=""
                initialColor={newTagDefaultColor}
                onSave={handleSaveNew}
                onCancel={handleCancelEdit}
                isSaving={createTag.isPending}
                error={editError}
                labelPlaceholder={t("manageTagsDialog.labelPlaceholder")}
              />
            )}
          </div>

          {/* Add tag button */}
          {editingId === null && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddNew}
              className="w-full mt-2"
              data-testid="manage-tags-add-btn"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("manageTagsDialog.addNew")}
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onConfirm={() => {
          if (deleteTarget) deleteTag.mutate(deleteTarget.id);
        }}
        onCancel={() => setDeleteTarget(null)}
        title={t("common.delete")}
        description={t("manageTagsDialog.deleteConfirm")}
      />
    </>
  );
}
