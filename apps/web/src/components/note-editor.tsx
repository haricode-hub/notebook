"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { Button } from "@/components/ui/button";

export default function NoteEditor({ initialMarkdown, onChange }: {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: initialMarkdown,
    contentType: "markdown",
    immediatelyRender: false,
    onUpdate: ({ editor: changed }) => onChange(changed.getMarkdown()),
  });

  if (!editor) return <div className="h-40 animate-pulse rounded bg-slate-100 dark:bg-slate-800" aria-label="Loading note editor" />;
  return <div className="rounded-lg border border-slate-200 dark:border-slate-700">
    <div className="flex gap-1 border-b border-slate-200 p-1 dark:border-slate-700" role="toolbar" aria-label="Note formatting">
      <Button size="sm" type="button" variant={editor.isActive("bold") ? "default" : "ghost"} onClick={() => editor.chain().focus().toggleBold().run()}>Bold</Button>
      <Button size="sm" type="button" variant={editor.isActive("italic") ? "default" : "ghost"} onClick={() => editor.chain().focus().toggleItalic().run()}>Italic</Button>
      <Button size="sm" type="button" variant={editor.isActive("heading", { level: 2 }) ? "default" : "ghost"} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>Heading</Button>
      <Button size="sm" type="button" variant={editor.isActive("bulletList") ? "default" : "ghost"} onClick={() => editor.chain().focus().toggleBulletList().run()}>List</Button>
    </div>
    <EditorContent editor={editor} aria-label="Note content" className="min-h-40 p-3 text-sm [&_.tiptap]:min-h-36 [&_.tiptap]:outline-none [&_h2]:my-2 [&_h2]:font-semibold [&_li]:ml-5 [&_p]:my-2 [&_ul]:list-disc" />
  </div>;
}
