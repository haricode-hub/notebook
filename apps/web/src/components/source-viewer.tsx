"use client";

import { Icon } from "@/components/icons/Icon";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronLeft, ChevronRight, ExternalLink, Pencil, X } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SourceTextBlock } from "@/components/source-text-block";
import { Input } from "@/components/ui/input";
import { getToken, sourceApi, type ChatCitation, type SourceContent } from "@/lib/api-client";
import { formatMediaTime } from "@/components/cited-markdown";
import { splitTextBlocks } from "@/lib/source-highlight";
import { springOptions } from "@/design/springs";
import { useMotionPrefs } from "@/design/use-motion-prefs";

const PdfOriginal = dynamic(() => import("@/components/pdf-original"), {
  ssr: false,
  loading: () => <p role="status" className="p-5 text-body">Loading PDF viewer…</p>,
});

export type ViewerSelection = {
  sourceId: string;
  citations: ChatCitation[];
  index: number;
  initialTab?: "guide";
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
    {blocks.length === 0 ? <p className="text-body text-fg-secondary">Text is not available yet.</p> : <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((item) => {
        const block = blocks[item.index];
        return <div key={item.key} data-index={item.index} ref={virtualizer.measureElement} className="absolute left-0 top-0 w-full pb-2" style={{ transform: `translateY(${item.start}px)` }}>
          <SourceTextBlock block={block} start={highlightStart} end={highlightEnd} />
        </div>;
      })}
    </div>}
  </div>;
}

function TimedAudioSource({ filePath, timeStart }: { filePath: string; timeStart: number | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void getToken().then(async (token) => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}${filePath}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) throw new Error("Could not load audio source");
      objectUrl = URL.createObjectURL(await response.blob());
      if (active) setUrl(objectUrl); else URL.revokeObjectURL(objectUrl);
    }).catch(() => { if (active) setUrl(null); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [filePath]);
  useEffect(() => { if (audioRef.current && timeStart != null) audioRef.current.currentTime = timeStart; }, [timeStart, url]);
  return url ? <audio ref={audioRef} className="w-full" controls src={url} aria-label="Source audio" /> : <p role="status">Loading audio source…</p>;
}

export function SourceViewer({ notebookId, selection, onClose, onNavigate, onAskQuestion }: {
  notebookId: string;
  selection: ViewerSelection;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onAskQuestion: (question: string) => void;
}) {
  const { reducedMotion } = useMotionPrefs();
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const citation = selection.citations[selection.index];
  const sourceId = citation?.source_id ?? selection.sourceId;
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: ["source-content", notebookId, sourceId],
    queryFn: () => sourceApi.content(notebookId, sourceId),
    staleTime: 240_000,
  });
  const [tab, setTab] = useState<"original" | "text" | "guide">(selection.initialTab ?? "original");
  const guide = useQuery({
    queryKey: ["guide", notebookId, sourceId],
    queryFn: () => sourceApi.guide(notebookId, sourceId),
    enabled: tab === "guide",
    refetchInterval: (query) => query.state.data?.status === "ready" ? false : 3000,
  });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [figureAsset, setFigureAsset] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!citation?.media_item_id) return;
    const mediaItemId = citation.media_item_id;
    let active = true;
    let objectUrl: string | null = null;
    void getToken().then(async (token) => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/notebooks/${notebookId}/media/${mediaItemId}/content`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) throw new Error("Could not load figure");
      objectUrl = URL.createObjectURL(await response.blob());
      if (active) setFigureAsset({ id: mediaItemId, url: objectUrl }); else URL.revokeObjectURL(objectUrl);
    }).catch(() => { if (active) setFigureAsset(null); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [citation?.media_item_id, notebookId]);
  const figureUrl = figureAsset && citation?.media_item_id === figureAsset.id ? figureAsset.url : null;
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

  return <div className="fixed inset-0 z-50 isolate" role="presentation">
    <motion.button type="button" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-0 bg-fg/40" aria-label="Close source viewer" onClick={onClose} transition={{ duration: reducedMotion ? 0 : 0.2 }} />
    <motion.aside initial={reducedMotion ? false : { x: "3%", opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={reducedMotion ? { duration: 0 } : springOptions("move")} role="dialog" aria-modal="true" aria-label="Source viewer" className="absolute inset-y-0 right-0 z-10 flex w-full max-w-3xl flex-col border-l border-border-subtle bg-surface" style={{ zIndex: 10 }}>
      <header className="flex items-center gap-2 border-b border-border-subtle p-3 border-border-subtle">
        <div className="min-w-0 flex-1">
          {editing ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void rename(); }}><Input aria-label="Source name" value={name} onChange={(event) => setName(event.target.value)} maxLength={255} autoFocus /><Button size="sm" disabled={saving || !name.trim()}>Save</Button></form> : <h2 className="truncate font-semibold">{data?.source.name ?? "Source"}</h2>}
          {citation && <p className="text-caption text-fg-secondary">Citation S{citation.n}{citation.page_start ? ` · page ${citation.page_start}` : ""}{citation.time_start != null ? ` · ${formatMediaTime(citation.time_start)}` : ""}</p>}
          {data?.source.ocr_pages.length ? <p className="text-caption text-warning">OCR-derived text · pages {data.source.ocr_pages.join(", ")}</p> : null}
        </div>
        {data && <Button size="sm" variant="ghost" aria-label="Rename source" onClick={() => { setName(data.source.name); setEditing(!editing); }}><Icon icon={Pencil} className="size-4" /></Button>}
        <Button size="sm" variant="ghost" aria-label="Close viewer" onClick={onClose}><Icon icon={X} className="size-4" /></Button>
      </header>
      {selection.citations.length > 0 && <nav className="flex items-center justify-between border-b border-border-subtle px-3 py-2 text-body border-border-subtle" aria-label="Citation navigation">
        <Button size="sm" variant="outline" disabled={selection.index === 0} onClick={() => onNavigate(selection.index - 1)}><Icon icon={ChevronLeft} className="size-4" /> Previous citation</Button>
        <span>{selection.index + 1} of {selection.citations.length}</span>
        <Button size="sm" variant="outline" disabled={selection.index === selection.citations.length - 1} onClick={() => onNavigate(selection.index + 1)}>Next citation <Icon icon={ChevronRight} className="size-4" /></Button>
      </nav>}
      <motion.div key={`${sourceId}:${citation?.chunk_id ?? citation?.n ?? 0}:${tab}`} initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.16 }} className="flex min-h-0 flex-1 flex-col">
      {isPending ? <div className="m-4 h-36 animate-pulse rounded bg-sunken" aria-label="Loading source" /> : isError || !data ? <p className="p-4 text-danger" role="alert">Could not load this source.</p> : <>
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2 border-border-subtle">
          <div role="tablist" aria-label="Source views" className="flex gap-1"><Button size="sm" variant={tab === "original" ? "default" : "outline"} role="tab" aria-selected={tab === "original"} onClick={() => setTab("original")}>{data.source.kind === "pdf" ? "Original" : "Text"}</Button>{data.source.kind === "pdf" && <Button size="sm" variant={tab === "text" ? "default" : "outline"} role="tab" aria-selected={tab === "text"} onClick={() => setTab("text")}>Text</Button>}<Button size="sm" variant={tab === "guide" ? "default" : "outline"} role="tab" aria-selected={tab === "guide"} onClick={() => setTab("guide")}>Guide</Button></div>
          {data.original_url && <a href={citation?.time_start != null && data.source.kind === "youtube" ? `${data.original_url}${data.original_url.includes("?") ? "&" : "?"}t=${Math.floor(citation.time_start)}s` : data.original_url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-body text-accent underline">{data.source.kind === "youtube" && citation?.time_start != null ? `Open video at ${formatMediaTime(citation.time_start)}` : "Original website"} <Icon icon={ExternalLink} className="size-3" /></a>}
          <details className="relative ml-auto text-body"><summary className="min-h-11 cursor-pointer px-2 py-3 hover:text-accent">Details</summary><div className="absolute right-0 z-20 mt-1 w-60 border border-border-subtle bg-raised p-3 border-border bg-surface"><p>Type: {data.source.kind.toUpperCase()}</p><p>Status: {data.source.status}</p>{data.source.page_count && <p>Pages: {data.source.page_count}</p>}<p>Added: {new Date(data.source.created_at).toLocaleDateString()}</p></div></details>
        </div>
        <div className="min-h-0 flex-1" role="tabpanel" aria-label={citation?.media_item_id ? "Cited figure" : tab === "guide" ? "Source guide" : data.source.kind === "pdf" && tab === "original" ? "Original PDF" : data.source.kind === "audio" ? "Audio transcript" : "Source text"}>
          {citation?.media_item_id ? <div className="h-full overflow-auto p-5"><p className="mb-3 text-body text-fg-secondary">Figure · page {citation.page_start ?? "unknown"}</p>{figureUrl ? <Image src={figureUrl} alt={citation.quote || "Cited figure from source"} width={1200} height={800} unoptimized className="mx-auto max-h-full max-w-full object-contain" /> : <p role="status">Loading cited figure…</p>}<p className="mt-3 text-body">{citation.quote}</p></div> :
          tab === "guide" ? <div className="h-full space-y-5 overflow-y-auto p-5 text-body">{guide.data?.status === "ready" ? <><section><h3 className="font-semibold">Summary</h3><p className="mt-2 max-w-[68ch] leading-relaxed">{guide.data.summary}</p></section><section><h3 className="font-semibold">Key topics</h3><p className="mt-2 text-fg-secondary">{guide.data.topics.join(" · ")}</p></section><section><h3 className="font-semibold">Suggested questions</h3><div className="mt-2 divide-y divide-border-subtle divide-border-subtle">{guide.data.questions.map((question) => <button key={question} type="button" className="min-h-11 w-full py-2 text-left hover:text-accent" onClick={() => { onAskQuestion(question); onClose(); }}>{question}</button>)}</div></section></> : <p role="status" className="text-fg-secondary">{guide.data?.error ?? "Generating a guide for this source…"}</p>}</div> : data.source.kind === "pdf" && tab === "original" && data.file_url ? <PdfOriginal key={sourceId} content={data} citation={citation} onShowText={() => setTab("text")} /> : <div className="flex h-full min-h-0 flex-col">{data.source.kind === "audio" && data.file_url && <div className="border-b p-3"><TimedAudioSource filePath={data.file_url} timeStart={citation?.time_start ?? null} /></div>}<div className="min-h-0 flex-1"><TextOriginal content={data} citation={citation} /></div></div>}
        </div>
      </>}
      </motion.div>
    </motion.aside>
  </div>;
}
