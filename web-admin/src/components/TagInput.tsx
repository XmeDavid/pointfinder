import { useState, type KeyboardEvent, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const DEFAULT_MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;

interface TagInputProps {
  /** Current tags (undefined is treated as empty). */
  value: string[] | undefined;
  /** Fires with the next tag list (or undefined when empty). */
  onChange: (next: string[] | undefined) => void;
  /** Placeholder for the input chip. */
  placeholder?: string;
  /** Upper bound on the tag count. Defaults to 20 (backend enforces 20). */
  maxTags?: number;
  /** Test id passed to the text input. */
  "data-testid"?: string;
  /** Optional className merged with the root. */
  className?: string;
}

/**
 * Free-text tag input used by the operator workflow (P1 Phase 4 W3 —
 * tags and colors on bases and challenges).
 *
 * Renders the current tags as removable chips and provides a text
 * input that commits a new tag on Enter or comma. Upper bound matches
 * the backend `@Size(max = 20)` validation; individual tags are
 * trimmed and deduplicated case-insensitively so operators cannot
 * accidentally create `Trail`, `trail`, and `TRAIL` as separate entries.
 *
 * Privacy: tags are operator-only metadata and are never exposed to
 * players. See `docs/business-logic.md` § "Tags and Colors on Bases and
 * Challenges".
 */
export function TagInput({
  value,
  onChange,
  placeholder,
  maxTags = DEFAULT_MAX_TAGS,
  "data-testid": testId,
  className,
}: TagInputProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string>("");
  const tags = value ?? [];
  const atLimit = tags.length >= maxTags;

  function commitDraft() {
    const raw = draft.trim();
    if (!raw) {
      setDraft("");
      return;
    }
    if (atLimit) {
      return;
    }
    const truncated = raw.slice(0, MAX_TAG_LENGTH);
    const lower = truncated.toLowerCase();
    if (tags.some((existing) => existing.toLowerCase() === lower)) {
      setDraft("");
      return;
    }
    const next = [...tags, truncated];
    onChange(next);
    setDraft("");
  }

  function removeTag(index: number) {
    const next = tags.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : undefined);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitDraft();
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      // Backspace on an empty draft removes the last tag (common pattern
      // from GitHub-style tag inputs). Never auto-commits.
      removeTag(tags.length - 1);
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw.includes(",")) {
      // Paste-friendly: split on commas, commit each piece in order.
      const pieces = raw.split(",").map((p) => p.trim()).filter(Boolean);
      const accumulated = [...tags];
      for (const piece of pieces) {
        if (accumulated.length >= maxTags) break;
        const truncated = piece.slice(0, MAX_TAG_LENGTH);
        const lower = truncated.toLowerCase();
        if (accumulated.some((existing) => existing.toLowerCase() === lower)) {
          continue;
        }
        accumulated.push(truncated);
      }
      if (accumulated.length !== tags.length) {
        onChange(accumulated);
      }
      setDraft("");
      return;
    }
    setDraft(raw.slice(0, MAX_TAG_LENGTH));
  }

  return (
    <div className={cn("space-y-2", className)}>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid={testId ? `${testId}-chips` : undefined}>
          {tags.map((tag, index) => (
            <Badge
              key={`${tag}-${index}`}
              variant="secondary"
              className="gap-1 pr-1"
              data-testid={testId ? `${testId}-chip-${index}` : undefined}
            >
              <span className="max-w-[160px] truncate" title={tag}>
                {tag}
              </span>
              <button
                type="button"
                onClick={() => removeTag(index)}
                className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-muted-foreground/20"
                aria-label={t("tags.remove", { tag })}
                data-testid={testId ? `${testId}-remove-${index}` : undefined}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        type="text"
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={commitDraft}
        placeholder={atLimit ? t("tags.limitReached", { max: maxTags }) : placeholder ?? t("tags.placeholder")}
        disabled={atLimit}
        maxLength={MAX_TAG_LENGTH}
        data-testid={testId}
        aria-label={t("tags.inputLabel")}
      />
      <p className="text-xs text-muted-foreground">
        {t("tags.hint", { count: tags.length, max: maxTags })}
      </p>
    </div>
  );
}
