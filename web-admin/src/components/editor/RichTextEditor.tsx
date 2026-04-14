import { useCallback, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import DOMPurify from "dompurify";
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
  Music,
  Paperclip,
  Undo,
  Redo,
} from "lucide-react";
import { AudioExtension } from "./AudioExtension";
import { FileEmbedExtension } from "./FileEmbedExtension";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { useTranslation } from "react-i18next";

const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.85;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

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
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    };
    img.src = objectUrl;
  });
}

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "h1",
      "h2",
      "h3",
      "ul",
      "ol",
      "li",
      "blockquote",
      "code",
      "pre",
      "img",
      "audio",
      "a",
      "div",
      "span",
    ],
    ALLOWED_ATTR: [
      "src",
      "alt",
      "href",
      "target",
      "rel",
      "controls",
      "preload",
      "style",
      "data-type",
      "data-resource-id",
      "data-resource-name",
      "data-resource-size",
      "data-resource-type",
      "contenteditable",
    ],
  });
}

interface FileEmbedResource {
  id: string;
  name: string;
  sizeBytes: number;
  contentType: string;
}

function useSyncRef<T>(ref: React.MutableRefObject<T> | undefined, value: T) {
  useEffect(() => {
    if (ref) ref.current = value;
  }, [ref, value]);
}

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  onInsertFileEmbed?: () => void;
  insertFileEmbedRef?: React.MutableRefObject<((resource: FileEmbedResource) => void) | null>;
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
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  content,
  onChange,
  placeholder,
  className,
  onInsertFileEmbed,
  insertFileEmbedRef,
}: RichTextEditorProps) {
  const toast = useToast();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapImage.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      AudioExtension,
      FileEmbedExtension,
    ],
    content,
    onUpdate: ({ editor: e }) => {
      onChange(sanitize(e.getHTML()));
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[150px] px-3 py-2",
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

      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(t("common.fileTooLarge", "File too large (max 5 MB)"));
        e.target.value = "";
        return;
      }

      resizeImage(file).then((dataUrl) => {
        editor.chain().focus().setImage({ src: dataUrl }).run();
      });

      e.target.value = "";
    },
    [editor, toast, t],
  );

  const addAudio = useCallback(() => {
    audioInputRef.current?.click();
  }, []);

  const handleAudioFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editor) return;

      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(t("common.fileTooLarge", "File too large (max 5 MB)"));
        e.target.value = "";
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        editor
          .chain()
          .focus()
          .insertContent({ type: "audio", attrs: { src: dataUrl } })
          .run();
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [editor, toast, t],
  );

  const addImageUrl = useCallback(() => {
    if (!editor) return;
    const url = window.prompt(t("editor.imageUrlPrompt", "Image URL:"));
    if (url) {
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          toast.error(t("errors.invalidUrl", "Invalid URL"));
          return;
        }
        editor.chain().focus().setImage({ src: parsed.href }).run();
      } catch {
        toast.error(t("errors.invalidUrl", "Invalid URL"));
      }
    }
  }, [editor, toast, t]);

  const insertFileEmbed = useCallback(
    (resource: FileEmbedResource) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .insertContent({
          type: "fileEmbed",
          attrs: {
            resourceId: resource.id,
            resourceName: resource.name,
            resourceSize: resource.sizeBytes,
            resourceType: resource.contentType,
          },
        })
        .run();
    },
    [editor],
  );

  // Expose insertFileEmbed via ref so parent components can call it after
  // selecting a resource from the picker.
  useSyncRef(insertFileEmbedRef, insertFileEmbed);

  if (!editor) return null;

  return (
    <div className={cn("rounded-md border border-input", className)}>
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
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          active={editor.isActive("heading", { level: 1 })}
          title={t("editor.heading1")}
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          active={editor.isActive("heading", { level: 2 })}
          title={t("editor.heading2")}
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
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
        <ToolbarButton
          onClick={addImageUrl}
          title={t("editor.imageFromUrl")}
        >
          <span className="text-xs font-medium">URL</span>
        </ToolbarButton>
        <ToolbarButton onClick={addAudio} title={t("editor.uploadAudio")}>
          <Music className="h-4 w-4" />
        </ToolbarButton>
        {onInsertFileEmbed && (
          <ToolbarButton
            onClick={onInsertFileEmbed}
            title={t("editor.insertFile", "Insert file")}
          >
            <Paperclip className="h-4 w-4" />
          </ToolbarButton>
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

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        onChange={handleAudioFileChange}
        className="hidden"
      />
    </div>
  );
}
