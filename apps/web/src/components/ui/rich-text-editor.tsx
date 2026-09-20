"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { isEmptyRichText, sanitizeRichText } from "@/lib/rich-text";

export function RichTextHtml({
  html,
  className,
  empty,
}: {
  html?: string;
  className?: string;
  empty?: ReactNode;
}) {
  if (isEmptyRichText(html)) {
    return <>{empty ?? <span className="text-muted-foreground italic">Not yet drafted.</span>}</>;
  }
  return (
    <div
      className={cn("oe-prose", className)}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(html!) }}
    />
  );
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={event => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
        "text-muted-foreground hover:bg-secondary hover:text-foreground",
        "disabled:opacity-40 disabled:pointer-events-none",
        active && "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-4 w-px bg-border shrink-0" />;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Start writing this section…",
  disabled = false,
  label,
  required,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  required?: boolean;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
        showOnlyCurrent: false,
      }),
    ],
    [placeholder],
  );

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions,
    content: value || "",
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "tiptap oe-prose oe-prose-editor",
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChangeRef.current(instance.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const next = value?.trim() ?? "";
    if (!next && editor.isEmpty) return;
    if (editor.getHTML() === next) return;
    editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, value]);

  const toolbar = useEditorState({
    editor,
    selector: snapshot => {
      const instance = snapshot.editor;
      if (!instance) return null;
      return {
        bold: instance.isActive("bold"),
        italic: instance.isActive("italic"),
        underline: instance.isActive("underline"),
        strike: instance.isActive("strike"),
        h2: instance.isActive("heading", { level: 2 }),
        h3: instance.isActive("heading", { level: 3 }),
        bullet: instance.isActive("bulletList"),
        ordered: instance.isActive("orderedList"),
        quote: instance.isActive("blockquote"),
        canUndo: instance.can().undo(),
        canRedo: instance.can().redo(),
      };
    },
  });

  return (
    <div className={cn("relative", disabled && "pointer-events-none")}>
      <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b border-border bg-muted/40">
        <ToolbarButton
          label="Undo"
          disabled={!toolbar?.canUndo}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          disabled={!toolbar?.canRedo}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 size={14} />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          label="Bold"
          active={toolbar?.bold}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={toolbar?.italic}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={toolbar?.underline}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <Underline size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          active={toolbar?.strike}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={14} />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          label="Heading"
          active={toolbar?.h2}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Subheading"
          active={toolbar?.h3}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={14} />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          label="Bulleted list"
          active={toolbar?.bullet}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={toolbar?.ordered}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={14} />
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={toolbar?.quote}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={14} />
        </ToolbarButton>
      </div>
      <div className="p-5 sm:p-8 min-h-[220px] sm:min-h-[280px]">
        {label && (
          <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-4 font-sans">
            {label}
            {required && <span className="text-destructive ml-1">* Required</span>}
          </h4>
        )}
        {editor ? (
          <EditorContent editor={editor} />
        ) : (
          <div className="h-[160px] rounded-md bg-muted/30 animate-pulse" />
        )}
      </div>
    </div>
  );
}
