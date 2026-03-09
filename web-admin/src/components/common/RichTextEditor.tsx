import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  ImageIcon,
  Undo,
  Redo,
  Variable,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { useTranslation } from "react-i18next";

const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.85;

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const { width, height } = img;
      const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
      const targetW = Math.round(width * scale);
      const targetH = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, targetW, targetH);
      resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // Fallback: return original as data URL
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    };
    img.src = objectUrl;
  });
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  availableVariables?: string[];
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors cursor-pointer",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({ value, onChange, placeholder, availableVariables }: RichTextEditorProps) {
  const toast = useToast();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [varDropdownOpen, setVarDropdownOpen] = useState(false);
  const varBtnRef = useRef<HTMLDivElement>(null);

  // Inline {{ suggestion state
  const [suggestionQuery, setSuggestionQuery] = useState<string | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [suggestionCoords, setSuggestionCoords] = useState<{ top: number; left: number } | null>(null);
  const suggestionRef = useRef<{ query: string | null; index: number; filtered: string[] }>({ query: null, index: 0, filtered: [] });

  const filteredSuggestions = availableVariables?.filter(
    (v) => suggestionQuery === null ? false : v.toLowerCase().startsWith(suggestionQuery.toLowerCase()),
  ) ?? [];
  // Keep ref in sync for handleKeyDown access (useLayoutEffect runs synchronously
  // before any event handlers, avoiding stale ref when user presses arrow keys)
  useLayoutEffect(() => {
    suggestionRef.current = { query: suggestionQuery, index: suggestionIndex, filtered: filteredSuggestions };
  });

  const checkSuggestion = useCallback((editorInstance: ReturnType<typeof useEditor>) => {
    if (!editorInstance || !availableVariables?.length) {
      setSuggestionQuery(null);
      setSuggestionCoords(null);
      return;
    }
    const { state } = editorInstance;
    const { from } = state.selection;
    const textBefore = state.doc.textBetween(
      Math.max(0, from - 50),
      from,
      "",
    );
    const match = textBefore.match(/\{\{(\w*)$/);
    if (match) {
      const coords = editorInstance.view.coordsAtPos(from);
      setSuggestionQuery(match[1]);
      setSuggestionIndex(0);
      setSuggestionCoords({
        top: coords.bottom + 4,
        left: coords.left,
      });
    } else {
      setSuggestionQuery(null);
      setSuggestionCoords(null);
    }
  }, [availableVariables]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapImage.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
      checkSuggestion(e);
    },
    onSelectionUpdate: ({ editor: e }) => {
      checkSuggestion(e);
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[150px] px-3 py-2",
      },
      handleKeyDown: (view, event) => {
        const { query, index, filtered } = suggestionRef.current;
        if (query === null || filtered.length === 0) return false;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSuggestionIndex((i) => (i + 1) % filtered.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSuggestionIndex((i) => (i - 1 + filtered.length) % filtered.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          const selected = filtered[index];
          if (selected) {
            const { state } = view;
            const { from } = state.selection;
            const textBefore = state.doc.textBetween(Math.max(0, from - 50), from, "");
            const match = textBefore.match(/\{\{(\w*)$/);
            if (match) {
              const deleteFrom = from - match[0].length;
              const replacement = `{{${selected}}}`;
              view.dispatch(state.tr.delete(deleteFrom, from).insertText(replacement, deleteFrom));
            }
          }
          setSuggestionQuery(null);
          setSuggestionCoords(null);
          return true;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setSuggestionQuery(null);
          setSuggestionCoords(null);
          return true;
        }
        return false;
      },
    },
  });

  const addImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editor) return;

      resizeImage(file).then((dataUrl) => {
        editor.chain().focus().setImage({ src: dataUrl }).run();
      });

      // Reset so the same file can be picked again
      e.target.value = "";
    },
    [editor]
  );

  const addImageUrl = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Image URL:");
    if (url) {
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          toast.error(t("errors.invalidUrl"));
          return;
        }
        editor.chain().focus().setImage({ src: parsed.href }).run();
      } catch {
        toast.error(t("errors.invalidUrl"));
      }
    }
  }, [editor, toast, t]);

  const selectSuggestion = useCallback((varName: string) => {
    if (!editor) return;
    const { state } = editor;
    const { from } = state.selection;
    const textBefore = state.doc.textBetween(Math.max(0, from - 50), from, "");
    const match = textBefore.match(/\{\{(\w*)$/);
    if (match) {
      const deleteFrom = from - match[0].length;
      editor.chain().focus()
        .deleteRange({ from: deleteFrom, to: from })
        .insertContent(`{{${varName}}}`)
        .run();
    }
    setSuggestionQuery(null);
    setSuggestionCoords(null);
  }, [editor]);

  const insertVariable = useCallback((varName: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(`{{${varName}}}`).run();
    setVarDropdownOpen(false);
  }, [editor]);

  if (!editor) return null;

  const hasVariables = availableVariables && availableVariables.length > 0;

  return (
    <div className="rounded-md border border-input">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/50 px-2 py-1">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title={t("editor.bold")}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title={t("editor.italic")}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-border" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive("heading", { level: 1 })}
          title={t("editor.heading1")}
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title={t("editor.heading2")}
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          title={t("editor.heading3")}
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-border" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title={t("editor.bulletList")}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title={t("editor.orderedList")}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title={t("editor.blockquote")}
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive("codeBlock")}
          title={t("editor.codeBlock")}
        >
          <Code className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-border" />

        <ToolbarButton onClick={addImage} title={t("editor.uploadImage")}>
          <ImageIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={addImageUrl} title={t("editor.imageFromUrl")}>
          <span className="text-xs font-medium">URL</span>
        </ToolbarButton>

        {hasVariables && (
          <>
            <div className="mx-1 h-5 w-px bg-border" />
            <div className="relative" ref={varBtnRef}>
              <ToolbarButton
                onClick={() => setVarDropdownOpen((o) => !o)}
                active={varDropdownOpen}
                title={t("editor.insertVariable")}
              >
                <Variable className="h-4 w-4" />
              </ToolbarButton>
              {varDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setVarDropdownOpen(false)} />
                  <div className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-md border border-border bg-popover shadow-md">
                    <div className="py-1">
                      {availableVariables!.map((v) => (
                        <button
                          key={v}
                          type="button"
                          className="flex w-full items-center px-3 py-1.5 text-sm font-mono hover:bg-accent hover:text-accent-foreground cursor-pointer"
                          onClick={() => insertVariable(v)}
                        >
                          {`{{${v}}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        <div className="mx-1 h-5 w-px bg-border" />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title={t("editor.undo")}
        >
          <Undo className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title={t("editor.redo")}
        >
          <Redo className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Editor content */}
      <EditorContent editor={editor} />

      {/* Inline {{ suggestion popup — fixed positioning to avoid clipping by scroll containers */}
      {suggestionQuery !== null && suggestionCoords && filteredSuggestions.length > 0 && (
        <div
          className="fixed z-[100] min-w-[160px] rounded-md border border-border bg-popover shadow-md"
          style={{ top: suggestionCoords.top, left: suggestionCoords.left }}
        >
          <div className="py-1">
            {filteredSuggestions.map((v, i) => (
              <button
                key={v}
                type="button"
                className={cn(
                  "flex w-full items-center px-3 py-1.5 text-sm font-mono cursor-pointer",
                  i === suggestionIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent hover:text-accent-foreground",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectSuggestion(v);
                }}
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hidden file input for image uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
