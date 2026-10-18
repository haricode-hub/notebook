"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronLeft, ChevronRight, ExternalLink, Pencil, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SourceTextBlock } from "@/components/source-text-block";
import { Input } from "@/components/ui/input";
import { sourceApi, type ChatCitation, type SourceContent } from "@/lib/api-client";
import { splitTextBlocks } from "@/lib/source-highlight";

const PdfOriginal = dynamic(() => import("@/components/pdf-original"), {
  ssr: false,
  loading: () => <p role="status" className="p-5 text-sm">Loading PDF viewer…</p>,
});

export type ViewerSelection = {
  sourceId: string;
  citations: ChatCitation[];
  index: number;
};

function TextOriginal({ content, citation }: { content: SourceContent; citation?: ChatCitation }) {
  const blocks = useMemo(() => splitTextBlocks(content.text), [content.text]);
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: blocks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 220,
    overscan: 3,
  });
  const chunk = content.chunks.find((item) => item.id === citation?.chunk_id);
  const highlightStart = chunk?.char_start ?? citation?.char_start;
  const highlightEnd = chunk?.char_end ?? citation?.char_end;
  const targetIndex = blocks.findIndex((block) => highlightStart !== undefined && block.end > highlightStart);

  useEffect(() => {
    if (targetIndex < 0) return;
    virtualizer.scrollToIndex(targetIndex, { align: "center" });
    const timer = setTimeout(() => parentRef.current?.querySelector("mark[data-citation-highlight]")?.scrollIntoView({ block: "center" }), 80);
    return () => clearTimeout(timer);
  }, [targetIndex, citation?.chunk_id, virtualizer]);

  return <div ref={parentRef} className="h-full overflow-y-auto p-4" aria-label="Source text">
    {blocks.length === 0 ? <p className="text-sm text-slate-500">Text is not available yet.</p> : <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((item) => {
        const block = blocks[item.index];
        return <div key={item.key} data-index={item.index} ref={virtualizer.measureElement} className="absolute left-0 top-0 w-full pb-2" style={{ transform: `translateY(${item.start}px)` }}>
          <SourceTextBlock block={block} start={highlightStart} end={highlightEnd} />
        </div>;
      })}
    </div>}
  </div>;
}

export function SourceViewer({ notebookId, selection, onClose, onNavigate }: {
  notebookId: string;
  selection: ViewerSelection;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const citation = selection.citations[selection.index];
  const sourceId = citation?.source_id ?? selection.sourceId;
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: ["source-content", notebookId, sourceId],
    queryFn: () => sourceApi.content(notebookId, sourceId),
    staleTime: 240_000,
  });
  const [tab, setTab] = useState<"original" | "text">("original");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if ((event.target as HTMLElement).matches("input, textarea")) return;
      if (event.key === "ArrowRight" && selection.index < selection.citations.length - 1) onNavigate(selection.index + 1);
      if (event.key === "ArrowLeft" && selection.index > 0) onNavigate(selection.index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNavigate, selection.index, selection.citations.length]);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const rename = async () => {
    if (!data || !name.trim()) return;
    setSaving(true);
    try {
      await sourceApi.rename(notebookId, sourceId, name.trim());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sources", notebookId] }),
        queryClient.invalidateQueries({ queryKey: ["source-content", notebookId, sourceId] }),
      ]);
      setEditing(false);
      toast.success("Source renamed");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Rename failed"); }
    finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-50" role="presentation">
    <button type="button" className="absolute inset-0 bg-slate-950/50" aria-label="Close source viewer" onClick={onClose} />
    <aside role="dialog" aria-modal="true" aria-label="Source viewer" className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col bg-white shadow-2xl dark:bg-slate-950">
      <header className="flex items-center gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
        <div className="min-w-0 flex-1">
          {editing ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void rename(); }}><Input aria-label="Source name" value={name} onChange={(event) => setName(event.target.value)} maxLength={255} autoFocus /><Button size="sm" disabled={saving || !name.trim()}>Save</Button></form> : <h2 className="truncate font-semibold">{data?.source.name ?? "Source"}</h2>}
          {citation && <p className="text-xs text-slate-500">Citation S{citation.n}{citation.page_start ? ` · page ${citation.page_start}` : ""}</p>}
        </div>
        {data && <Button size="sm" variant="ghost" aria-label="Rename source" onClick={() => { setName(data.source.name); setEditing(!editing); }}><Pencil className="size-4" /></Button>}
        <Button size="sm" variant="ghost" aria-label="Close viewer" onClick={onClose}><X className="size-4" /></Button>
      </header>
      {selection.citations.length > 0 && <nav className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-sm dark:border-slate-800" aria-label="Citation navigation">
        <Button size="sm" variant="outline" disabled={selection.index === 0} onClick={() => onNavigate(selection.index - 1)}><ChevronLeft className="size-4" /> Previous citation</Button>
        <span>{selection.index + 1} of {selection.citations.length}</span>
        <Button size="sm" variant="outline" disabled={selection.index === selection.citations.length - 1} onClick={() => onNavigate(selection.index + 1)}>Next citation <ChevronRight className="size-4" /></Button>
      </nav>}
      {isPending ? <div className="m-4 h-36 animate-pulse rounded bg-slate-200 dark:bg-slate-800" aria-label="Loading source" /> : isError || !data ? <p className="p-4 text-red-600" role="alert">Could not load this source.</p> : <>
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          {data.source.kind === "pdf" && <div role="tablist" aria-label="Source views" className="flex gap-1"><Button size="sm" variant={tab === "original" ? "default" : "outline"} role="tab" aria-selected={tab === "original"} onClick={() => setTab("original")}>Original</Button><Button size="sm" variant={tab === "text" ? "default" : "outline"} role="tab" aria-selected={tab === "text"} onClick={() => setTab("text")}>Text</Button></div>}
          {data.original_url && <a href={data.original_url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-sm text-indigo-600 underline">Original website <ExternalLink className="size-3" /></a>}
          <details className="relative ml-auto text-sm"><summary className="cursor-pointer rounded px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">Details</summary><div className="absolute right-0 z-20 mt-1 w-60 rounded border bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"><p>Type: {data.source.kind.toUpperCase()}</p><p>Status: {data.source.status}</p>{data.source.page_count && <p>Pages: {data.source.page_count}</p>}<p>Added: {new Date(data.source.created_at).toLocaleDateString()}</p></div></details>
        </div>
        <div className="min-h-0 flex-1" role="tabpanel" aria-label={data.source.kind === "pdf" && tab === "original" ? "Original PDF" : "Source text"}>
          {data.source.kind === "pdf" && tab === "original" && data.file_url ? <PdfOriginal key={sourceId} content={data} citation={citation} onShowText={() => setTab("text")} /> : <TextOriginal content={data} citation={citation} />}
        </div>
      </>}
    </aside>
  </div>;
}
