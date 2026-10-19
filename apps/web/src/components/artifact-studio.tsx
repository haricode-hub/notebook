"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Download, FileText, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { CitedMarkdown } from "@/components/cited-markdown";
import { Button } from "@/components/ui/button";
import { AudioPlayer } from "@/components/audio-player";
import { Input } from "@/components/ui/input";
import { artifactApi, getToken, sourceApi, type Artifact, type ChatCitation } from "@/lib/api-client";

const labels: Record<string, string> = {
  briefing: "Briefing doc", study_guide: "Study guide", faq: "FAQ", timeline: "Timeline", report: "Custom report", mindmap: "Mind map", flashcards: "Flashcards", quiz: "Quiz", audio_overview: "Audio overview",
};
const MindMapView = dynamic(() => import("@/components/mindmap-view"), { ssr: false });
const FlashcardsView = dynamic(() => import("@/components/flashcards-view"), { ssr: false });
const QuizView = dynamic(() => import("@/components/quiz-view"), { ssr: false });

function useArtifactEvents(notebookId: string) {
  const client = useQueryClient();
  useEffect(() => {
    const controller = new AbortController();
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const listen = async () => {
      while (!controller.signal.aborted) {
        try {
          const token = await getToken(true);
          const response = await fetch(`${base}/notebooks/${encodeURIComponent(notebookId)}/artifacts/events`, {
            headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
          });
          if (!response.ok || !response.body) throw new Error("Artifact event stream unavailable");
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let pending = "";
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              pending += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
              const frames = pending.split("\n\n");
              pending = frames.pop() ?? "";
              if (frames.some((frame) => frame.split("\n").some((line) => line.startsWith("data: ")))) {
                await client.invalidateQueries({ queryKey: ["artifacts", notebookId] });
              }
            }
          } finally { reader.releaseLock(); }
        } catch { /* reconnect after a transient network or token failure */ }
        if (!controller.signal.aborted) await pause(1000);
      }
    };
    void listen();
    return () => controller.abort();
  }, [client, notebookId]);
}

async function saveExport(notebookId: string, artifact: Artifact, format: "md" | "docx") {
  const blob = await artifactApi.download(notebookId, artifact.id, format);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${artifact.recipe}-${artifact.id.slice(0, 8)}.${format}`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ArtifactViewer({ notebookId, artifact, onClose, onOpenCitation, onAskQuestion, onChanged }: {
  notebookId: string;
  artifact: Artifact;
  onClose: () => void;
  onOpenCitation: (citation: ChatCitation, citations: ChatCitation[]) => void;
  onAskQuestion: (question: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const exportAs = async (format: "md" | "docx") => {
    try { await saveExport(notebookId, artifact, format); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not export artifact"); }
  };
  return createPortal(<div id="artifact-print-root" role="dialog" aria-label="Artifact viewer" aria-modal="true" className="fixed inset-0 z-[80] flex flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <div className="artifact-toolbar flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
      <div><p className="text-xs uppercase tracking-wide text-indigo-600">{labels[artifact.recipe] ?? artifact.recipe}</p><h2 className="font-semibold">{artifact.output?.title ?? "Artifact"}</h2></div>
      <div className="flex flex-wrap gap-1">
        {!(["mindmap", "flashcards", "quiz"].includes(artifact.recipe)) && <><Button size="sm" variant="outline" onClick={() => void exportAs("md")}><Download className="size-3" /> Markdown</Button>
        <Button size="sm" variant="outline" onClick={() => void exportAs("docx")}><Download className="size-3" /> DOCX</Button></>}
        <Button size="sm" variant="outline" onClick={() => window.print()}><Download className="size-3" /> Print / PDF</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { await artifactApi.regenerate(notebookId, artifact.id); await onChanged(); onClose(); toast.success("Regenerating artifact"); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not regenerate"); } finally { setBusy(false); } }}><RotateCcw className="size-3" /> Regenerate</Button>
        <Button size="sm" variant="ghost" aria-label="Close artifact" onClick={onClose}><X className="size-4" /></Button>
      </div>
    </div>
    <article className="artifact-document mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-8" aria-label="Generated artifact">
      <h1 className="mb-6 text-3xl font-bold">{artifact.output?.title}</h1>
      {artifact.output && "sections" in artifact.output && artifact.output.sections.map((section, index) => <section key={`${section.heading}-${index}`} className="mb-8">
        <h2 className="mb-2 text-xl font-semibold">{section.heading}</h2>
        <CitedMarkdown content={section.markdown} citations={artifact.citations} onOpenCitation={(citation, citations) => { onClose(); onOpenCitation(citation, citations); }} />
      </section>)}
      {artifact.recipe === "mindmap" && artifact.output && "root" in artifact.output && <MindMapView root={artifact.output.root} citations={artifact.citations} onOpenCitation={(citation, citations) => { onClose(); onOpenCitation(citation, citations); }} onAskQuestion={(question) => { onClose(); onAskQuestion(question); }} />}
      {artifact.recipe === "flashcards" && artifact.output && "cards" in artifact.output && <FlashcardsView notebookId={notebookId} artifactId={artifact.id} cards={artifact.output.cards} citations={artifact.citations} />}
      {artifact.recipe === "quiz" && artifact.output && "questions" in artifact.output && <QuizView notebookId={notebookId} artifactId={artifact.id} questions={artifact.output.questions} citations={artifact.citations} onOpenCitation={(citation, citations) => { onClose(); onOpenCitation(citation, citations); }} />}
      {artifact.recipe === "audio_overview" && artifact.output && "transcript" in artifact.output && <AudioPlayer notebookId={notebookId} artifactId={artifact.id} transcript={artifact.output.transcript} citations={artifact.citations} onOpenCitation={(citation, citations) => { onClose(); onOpenCitation(citation, citations); }} />}
      <h2 className="mb-2 text-xl font-semibold">Sources</h2>
      <div className="flex flex-wrap gap-2">{artifact.citations.map((citation) => <button type="button" key={citation.n} className="rounded border px-2 py-1 text-sm" onClick={() => { onClose(); onOpenCitation(citation, artifact.citations); }}>[S{citation.n}] {citation.source_name}{citation.page_start ? `, p. ${citation.page_start}` : ""}</button>)}</div>
    </article>
  </div>, document.body);
}

export function ArtifactStudio({ notebookId, onOpenCitation, onAskQuestion }: {
  notebookId: string;
  onOpenCitation: (citation: ChatCitation, citations: ChatCitation[]) => void;
  onAskQuestion: (question: string) => void;
}) {
  const client = useQueryClient();
  const artifacts = useQuery({ queryKey: ["artifacts", notebookId], queryFn: () => artifactApi.list(notebookId), refetchInterval: (query) => query.state.data?.some((artifact) => artifact.status === "queued" || artifact.status === "running") ? 3000 : false });
  const recipes = useQuery({ queryKey: ["artifact-recipes", notebookId], queryFn: () => artifactApi.recipes(notebookId) });
  const sources = useQuery({ queryKey: ["sources", notebookId], queryFn: () => sourceApi.list(notebookId) });
  useArtifactEvents(notebookId);
  const [recipe, setRecipe] = useState<string | null>(null);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [language, setLanguage] = useState("English");
  const [tone, setTone] = useState<"conversational" | "curious" | "formal">("conversational");
  const [length, setLength] = useState<"short" | "default" | "long">("default");
  const [focus, setFocus] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [modelOverride, setModelOverride] = useState("");
  const [creating, setCreating] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const current = artifacts.data?.find((item) => item.id === viewId);
  const readySources = sources.data?.filter((source) => source.status === "ready" && source.selected) ?? [];
  const refresh = () => client.invalidateQueries({ queryKey: ["artifacts", notebookId] });
  const start = async () => {
    if (!recipe || !sourceIds.length) return;
    setCreating(true);
    try {
      await artifactApi.create(notebookId, { recipe, source_ids: sourceIds, language, tone, length, focus, model_override: modelOverride, question_count: questionCount, difficulty });
      setRecipe(null);
      await refresh();
      toast.success("Artifact queued");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not generate artifact"); }
    finally { setCreating(false); }
  };
  return <section aria-label="Studio artifacts" className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
    <div><h3 className="font-medium">Create with Studio</h3><p className="text-xs text-slate-500">Source-grounded documents with clickable citations.</p></div>
    <div className="grid grid-cols-2 gap-2">
      {(recipes.data ?? Object.entries(labels).map(([id, title]) => ({ id, title, renderer_id: "markdown_sections_v1" }))).map((item) => <button type="button" key={item.id} disabled={!readySources.length} onClick={() => { setRecipe(item.id); setSourceIds(readySources.map((source) => source.id)); }} className="flex min-h-20 flex-col items-start rounded-lg border border-slate-200 p-2 text-left text-sm hover:border-indigo-500 disabled:opacity-50 dark:border-slate-700"><FileText className="mb-1 size-4 text-indigo-600" />{item.title}</button>)}
    </div>
    {!readySources.length && <p className="text-xs text-slate-500">Add a source and wait for it to be ready to generate a document.</p>}
    {artifacts.data?.length ? <div><h3 className="mb-2 font-medium">Generated documents</h3><ul className="space-y-2">{artifacts.data.map((artifact) => <li key={artifact.id} className="rounded border border-slate-200 p-2 dark:border-slate-700">
      <div className="flex items-start justify-between gap-2"><button type="button" disabled={artifact.status !== "ready"} onClick={() => setViewId(artifact.id)} className="text-left text-sm font-medium hover:text-indigo-600 disabled:cursor-default">{artifact.output?.title ?? labels[artifact.recipe] ?? artifact.recipe}</button><span className="text-xs text-slate-500">{artifact.status}</span></div>
      {artifact.status === "running" || artifact.status === "queued" ? <div className="mt-2"><div className="mb-1 text-xs text-slate-500">{artifact.stage} · {artifact.progress}%</div><div className="h-1.5 rounded bg-slate-200"><div className="h-full rounded bg-indigo-500" style={{ width: `${artifact.progress}%` }} /></div></div> : null}
      {artifact.error && <p className="mt-1 text-xs text-red-600">{artifact.error}</p>}
      <div className="mt-1 flex gap-1">{artifact.status === "failed" && <Button size="sm" variant="outline" onClick={async () => { try { await artifactApi.regenerate(notebookId, artifact.id); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not retry"); } }}>Retry</Button>}{artifact.recipe === "audio_overview" && ["queued", "running"].includes(artifact.status) && <Button size="sm" variant="outline" onClick={async () => { try { await artifactApi.cancel(notebookId, artifact.id); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not cancel audio"); } }}><Ban className="size-3" /> Cancel</Button>}{["ready", "failed", "cancelled"].includes(artifact.status) && <Button size="sm" variant="ghost" aria-label={`Delete ${artifact.recipe} artifact`} onClick={async () => { try { await artifactApi.remove(notebookId, artifact.id); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete"); } }}><Trash2 className="size-3" /></Button>}</div>
    </li>)}</ul></div> : null}
    {recipe && createPortal(<div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Generate artifact"><div className="w-full max-w-lg space-y-3 rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900"><div className="flex justify-between"><h2 className="text-lg font-semibold">Generate {labels[recipe]}</h2><Button size="sm" variant="ghost" aria-label="Close options" onClick={() => setRecipe(null)}><X className="size-4" /></Button></div>
      <fieldset><legend className="mb-1 text-sm font-medium">Sources</legend><div className="max-h-32 space-y-1 overflow-y-auto">{readySources.map((source) => <label key={source.id} className="flex gap-2 text-sm"><input type="checkbox" checked={sourceIds.includes(source.id)} onChange={(event) => setSourceIds((current) => event.target.checked ? [...current, source.id] : current.filter((id) => id !== source.id))} />{source.name}</label>)}</div></fieldset>
      {recipe === "audio_overview" ? <label className="block text-sm">Language<select aria-label="Language" className="mt-1 w-full rounded border p-2 dark:bg-slate-900" value={language} onChange={(event) => setLanguage(event.target.value)}><option>English</option><option>British English</option><option>Spanish</option><option>French</option><option>Hindi</option></select></label> : <label className="block text-sm">Language<Input value={language} onChange={(event) => setLanguage(event.target.value)} maxLength={50} /></label>}
      {recipe === "audio_overview" && <label className="block text-sm">Tone<select aria-label="Audio tone" className="mt-1 w-full rounded border p-2 dark:bg-slate-900" value={tone} onChange={(event) => setTone(event.target.value as typeof tone)}><option value="conversational">Conversational</option><option value="curious">Curious</option><option value="formal">Formal</option></select></label>}
      <label className="block text-sm">Length<select className="mt-1 w-full rounded border p-2 dark:bg-slate-900" value={length} onChange={(event) => setLength(event.target.value as typeof length)}><option value="short">Short</option><option value="default">Default</option><option value="long">Long</option></select></label>
      {recipe === "quiz" && <><label className="block text-sm">Question count<select className="mt-1 w-full rounded border p-2 dark:bg-slate-900" value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}>{[5, 10, 15, 20].map((count) => <option key={count} value={count}>{count}</option>)}</select></label><label className="block text-sm">Difficulty<select className="mt-1 w-full rounded border p-2 dark:bg-slate-900" value={difficulty} onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label></>}
      <label className="block text-sm">Focus (optional)<textarea className="mt-1 w-full rounded border p-2 dark:bg-slate-900" value={focus} onChange={(event) => setFocus(event.target.value)} maxLength={2000} rows={2} /></label>
      <label className="block text-sm">Model override (optional)<Input value={modelOverride} onChange={(event) => setModelOverride(event.target.value)} placeholder="Use your cheap model" maxLength={200} /></label>
      <Button onClick={() => void start()} disabled={!sourceIds.length || !language.trim() || creating}>{creating ? "Queuing…" : "Generate"}</Button>
    </div></div>, document.body)}
    {current?.status === "ready" && <ArtifactViewer notebookId={notebookId} artifact={current} onClose={() => setViewId(null)} onOpenCitation={onOpenCitation} onAskQuestion={onAskQuestion} onChanged={refresh} />}
  </section>;
}
