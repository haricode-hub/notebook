"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Globe2, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getToken, sourceApi, uploadSource } from "@/lib/api-client";

export function SourcesPanel({ notebookId }: { notebookId: string }) {
  const client = useQueryClient();
  const { data: sources = [], isPending } = useQuery({ queryKey: ["sources", notebookId], queryFn: () => sourceApi.list(notebookId) });
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"file" | "url" | "text">("file");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [reindexProgress, setReindexProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const connect = async () => {
      if (controller.signal.aborted) return;
      try {
        const token = await getToken(true);
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/notebooks/${encodeURIComponent(notebookId)}/events`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: "no-store" });
        if (!response.ok || !response.body) throw new Error("Live status disconnected");
        await client.invalidateQueries({ queryKey: ["sources", notebookId] });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          const events = pending.split("\n\n");
          pending = events.pop() ?? "";
          for (const event of events) {
            if (!event.startsWith("data: ")) continue;
            try {
              const update = JSON.parse(event.slice(6)) as { stage: string; progress: number; error?: string; source_id: string };
              if (update.stage === "reindexing") setReindexProgress(update.progress);
              if (update.stage === "ready") setReindexProgress(null);
              if (update.stage === "failed" && !update.source_id) { setReindexProgress(null); toast.error(update.error ?? "Re-index failed"); }
            } catch { /* A malformed progress event does not interrupt the stream. */ }
            client.invalidateQueries({ queryKey: ["sources", notebookId] });
          }
        }
      } catch {
        // A fresh token is requested when the stream reconnects.
      }
      if (!controller.signal.aborted) retryTimer = setTimeout(connect, 1000);
    };
    void connect();
    return () => { controller.abort(); if (retryTimer) clearTimeout(retryTimer); };
  }, [notebookId, client]);

  const refresh = () => client.invalidateQueries({ queryKey: ["sources", notebookId] });
  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "file") {
        const file = fileRef.current?.files?.[0];
        if (!file) throw new Error("Choose a file first");
        setUploadProgress(0);
        await uploadSource(notebookId, file, setUploadProgress);
      } else if (mode === "url") {
        await sourceApi.url(notebookId, url.trim());
      } else {
        await sourceApi.text(notebookId, name.trim() || "Pasted text", text);
      }
      toast.success("Source added");
      setOpen(false); setUrl(""); setText(""); setName("");
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add source"); }
    finally { setBusy(false); setUploadProgress(null); }
  };

  return <section className="flex h-full min-h-0 flex-col" aria-label="Sources">
    <div className="flex items-center justify-between border-b border-slate-200 p-3 dark:border-slate-800"><h2 className="font-semibold">Sources</h2><div className="flex gap-1">{sources.length > 0 && <Button size="sm" variant="ghost" aria-label="Re-index notebook" title="Re-index notebook" onClick={async () => { try { await sourceApi.reindex(notebookId); setReindexProgress(0); toast.success("Re-index queued"); } catch (error) { toast.error(error instanceof Error ? error.message : "Re-index failed"); } }}><RotateCcw className="size-4" /></Button>}<Button size="sm" onClick={() => setOpen(!open)}><Plus className="size-4" /> Add source</Button></div></div>
    {reindexProgress !== null && <p className="border-b border-slate-200 px-3 py-2 text-xs dark:border-slate-800" role="status">Re-indexing {reindexProgress}%</p>}
    {open && <div className="space-y-3 border-b border-slate-200 p-3 dark:border-slate-800">
      <div className="flex gap-1" role="tablist" aria-label="Source type">{(["file", "url", "text"] as const).map((item) => <Button key={item} size="sm" variant={mode === item ? "default" : "outline"} onClick={() => setMode(item)} type="button">{item === "file" ? "File" : item === "url" ? "URL" : "Paste text"}</Button>)}</div>
      {mode === "file" && <div><Label htmlFor="source-file">PDF, DOCX, PPTX, TXT or MD</Label><Input id="source-file" type="file" accept=".pdf,.docx,.pptx,.txt,.md" ref={fileRef} /></div>}
      {mode === "url" && <div><Label htmlFor="source-url">Website URL</Label><Input id="source-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/article" /></div>}
      {mode === "text" && <div className="space-y-2"><Label htmlFor="source-name">Name</Label><Input id="source-name" value={name} onChange={(event) => setName(event.target.value)} /><Label htmlFor="source-text">Text</Label><textarea id="source-text" className="min-h-28 w-full rounded-md border p-2 text-sm dark:bg-slate-900" value={text} onChange={(event) => setText(event.target.value)} /></div>}
      {uploadProgress !== null && <div role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100} className="text-sm">Uploading {uploadProgress}%</div>}
      <Button size="sm" disabled={busy} onClick={() => void submit()}><Upload className="size-4" /> {busy ? "Adding…" : "Add"}</Button>
    </div>}
    <div className="min-h-0 flex-1 overflow-y-auto p-3">{isPending ? <div className="space-y-2">{[1,2,3].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />)}</div> : sources.length === 0 ? <p className="mt-8 text-center text-sm text-slate-500">Add a file, website, or text to start researching.</p> : <ul className="space-y-2">{sources.map((source) => <li key={source.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"><div className="flex items-start gap-2">{source.kind === "web" ? <Globe2 className="mt-0.5 size-4 shrink-0" /> : <FileText className="mt-0.5 size-4 shrink-0" />}<div className="min-w-0 flex-1"><div className="truncate font-medium" title={source.name}>{source.name}</div><div className="capitalize text-slate-500">{source.status}{source.status !== "ready" && source.status !== "failed" ? ` · ${source.progress}%` : ""}</div>{source.error && <p className="mt-1 text-red-600" role="alert">{source.error}</p>}</div></div><div className="mt-2 flex gap-2">{source.status === "failed" && <Button size="sm" variant="outline" onClick={async () => { try { await sourceApi.retry(notebookId, source.id); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Retry failed"); } }}><RotateCcw className="size-3" /> Retry</Button>}<Button size="sm" variant="ghost" onClick={async () => { try { await sourceApi.remove(notebookId, source.id); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Delete failed"); } }} aria-label={`Delete ${source.name}`}><Trash2 className="size-3" /></Button></div></li>)}</ul>}</div>
  </section>;
}
