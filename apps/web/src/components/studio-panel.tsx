"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FilePlus2, Pin, Save, Trash2 } from "lucide-react";
import { Icon } from "@/components/icons/Icon";
import dynamic from "next/dynamic";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArtifactStudio } from "@/components/artifact-studio";
import { guideApi, noteApi, type ChatCitation, type Note } from "@/lib/api-client";

const NoteEditor = dynamic(() => import("@/components/note-editor"), { ssr: false });

function exportMarkdown(note: Note, title: string, markdown: string) {
  const references = note.citations.map((citation) => `[S${citation.n}] ${citation.source_name}${citation.page_start ? `, page ${citation.page_start}` : ""}: ${citation.quote}`).join("\n");
  const text = `# ${title}\n\n${markdown}${references ? `\n\n## Citations\n\n${references}\n` : "\n"}`;
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "note"}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function StudioPanel({ notebookId, onAskQuestion, onOpenCitation, onOpenArtifact }: {
  notebookId: string;
  onAskQuestion: (question: string) => void;
  onOpenCitation: (citation: ChatCitation, citations: ChatCitation[]) => void;
  onOpenArtifact: (artifactId: string) => void;
}) {
  const client = useQueryClient();
  const notes = useQuery({ queryKey: ["notes", notebookId], queryFn: () => noteApi.list(notebookId) });
  const overview = useQuery({ queryKey: ["overview", notebookId], queryFn: () => guideApi.overview(notebookId), refetchInterval: (query) => query.state.data?.status === "ready" ? false : 5000 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = notes.data?.find((note) => note.id === selectedId);
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => client.invalidateQueries({ queryKey: ["notes", notebookId] });
  const create = async () => {
    try {
      const note = await noteApi.create(notebookId, { title: "Untitled note", content_markdown: "", pinned: false });
      await refresh();
      setSelectedId(note.id);
      setTitle(note.title);
      setMarkdown(note.content_markdown);
      toast.success("Note created");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create note"); }
  };
  const save = async (): Promise<boolean> => {
    if (!selected) return false;
    setBusy(true);
    try { await noteApi.update(notebookId, selected.id, { title, content_markdown: markdown }); await refresh(); toast.success("Note saved"); return true; }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not save note"); return false; }
    finally { setBusy(false); }
  };
  const convert = async () => {
    if (!selected) return;
    try {
      if (!await save()) return;
      await noteApi.convert(notebookId, selected.id);
      await Promise.all([refresh(), client.invalidateQueries({ queryKey: ["sources", notebookId] })]);
      toast.success("Note added as a source");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not convert note"); }
  };

  return <section className="flex h-full min-h-0 flex-col" aria-label="Studio">
    <div className="border-b border-border-subtle p-3"><h2 className="text-heading font-medium">Studio</h2><p className="text-caption text-fg-secondary">Overview and notes · results open in the center</p></div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      <ArtifactStudio notebookId={notebookId} onOpenArtifact={onOpenArtifact} />
      <section className="border-y border-border-subtle py-3" aria-label="Notebook overview">
        <h3 className="font-medium">Notebook overview</h3>
        {overview.data?.status === "ready" ? <><p className="mt-2 text-body leading-relaxed">{overview.data.summary}</p><p className="mt-2 text-caption text-fg-secondary">{overview.data.topics.join(" · ")}</p><div className="mt-3 divide-y divide-border-subtle">{overview.data.questions.map((question) => <button key={question} type="button" onClick={() => onAskQuestion(question)} className="block min-h-11 w-full py-2 text-left text-body hover:text-accent">{question}</button>)}</div></> : <p className="mt-2 text-caption text-fg-secondary">{overview.data?.error ?? "The overview will appear after your sources are ready."}</p>}
      </section>
      <div className="flex items-center justify-between"><h3 className="text-heading font-medium">Notes</h3><Button size="sm" variant="outline" onClick={() => void create()}><Icon icon={FilePlus2} size={16} /> New note</Button></div>
      {notes.isPending ? <div className="h-16 animate-pulse rounded-md bg-sunken" /> : notes.data?.length ? <ul className="divide-y divide-border-subtle">{notes.data.map((note) => <li key={note.id}><button type="button" onClick={() => { setSelectedId(note.id); setTitle(note.title); setMarkdown(note.content_markdown); }} className={`min-h-11 w-full truncate py-2 text-left text-body ${selectedId === note.id ? "font-medium text-fg" : "text-fg-secondary"}`}>{note.pinned ? "Pinned · " : ""}{note.title}</button></li>)}</ul> : <p className="py-3 text-small text-fg-tertiary">Saved answers and notes will appear here.</p>}
      {selected && <div className="space-y-2 border-t border-border-subtle py-3" aria-label="Selected note">
        <Input aria-label="Note title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
        <NoteEditor key={selected.id} initialMarkdown={selected.content_markdown} onChange={setMarkdown} />
        {selected.citations.length > 0 && <div className="flex flex-wrap gap-1" aria-label="Saved citations">{selected.citations.map((citation) => <Button key={`${citation.n}-${citation.chunk_id}`} size="sm" variant="outline" onClick={() => onOpenCitation(citation, selected.citations)}>S{citation.n}: {citation.source_name}</Button>)}</div>}
        <div className="flex flex-wrap gap-1">
          <Button size="sm" onClick={() => void save()} disabled={busy || !title.trim()}><Icon icon={Save} size={14} /> Save</Button>
          <Button size="sm" variant="outline" onClick={async () => { try { await noteApi.update(notebookId, selected.id, { pinned: !selected.pinned }); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not pin note"); } }}><Icon icon={Pin} size={14} /> {selected.pinned ? "Unpin" : "Pin"}</Button>
          <Button size="sm" variant="outline" onClick={() => exportMarkdown(selected, title, markdown)}><Icon icon={Download} size={14} /> Markdown</Button>
          <Button size="sm" variant="outline" onClick={() => void convert()} disabled={!markdown.trim()}>Convert to source</Button>
          <Button size="sm" variant="ghost" aria-label="Delete note" onClick={async () => { try { await noteApi.remove(notebookId, selected.id); setSelectedId(null); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete note"); } }}><Icon icon={Trash2} size={14} /></Button>
        </div>
      </div>}
    </div>
  </section>;
}
