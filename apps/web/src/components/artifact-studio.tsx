"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Ban, BookOpen, CircleHelp, Download, FileText, GanttChart, Map, MessagesSquare, Network, Newspaper, RotateCcw, ScrollText, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { CitedMarkdown } from "@/components/cited-markdown";
import { Icon } from "@/components/icons/Icon";
import { Button } from "@/components/ui/button";
import { AudioPlayer } from "@/components/audio-player";
import { Checkbox } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { artifactApi, getToken, sourceApi, type Artifact, type ChatCitation } from "@/lib/api-client";

const labels: Record<string, string> = {
  briefing: "Briefing doc", study_guide: "Study guide", faq: "FAQ", timeline: "Timeline", report: "Custom report", mindmap: "Mind map", flashcards: "Flashcards", quiz: "Quiz", audio_overview: "Audio overview",
};
const descriptions: Record<string, string> = {
  briefing: "The essential findings and what they mean.", study_guide: "A structured guide for review and recall.", faq: "Concise answers to likely questions.", timeline: "Events arranged in source order.", report: "A focused report with cited sections.", mindmap: "Ideas and their relationships.", flashcards: "Question and answer cards for practice.", quiz: "A scored check of your understanding.", audio_overview: "A spoken conversation about the sources.",
};
const recipeStyles: Record<string, { icon: typeof FileText; color: string }> = {
  briefing: { icon: Newspaper, color: "text-fg-secondary" },
  study_guide: { icon: ScrollText, color: "text-fg-secondary" },
  faq: { icon: MessagesSquare, color: "text-fg-secondary" },
  timeline: { icon: GanttChart, color: "text-fg-secondary" },
  report: { icon: FileText, color: "text-fg-secondary" },
  mindmap: { icon: Network, color: "text-fg-secondary" },
  flashcards: { icon: BookOpen, color: "text-fg-secondary" },
  quiz: { icon: CircleHelp, color: "text-fg-secondary" },
  audio_overview: { icon: AudioLines, color: "text-fg-secondary" },
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

async function saveExport(notebookId: string, artifact: Artifact, format: "md" | "docx" | "pdf") {
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
  const exportAs = async (format: "md" | "docx" | "pdf") => {
    try { await saveExport(notebookId, artifact, format); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not export artifact"); }
  };
  return <section id="artifact-print-root" aria-label="Artifact viewer" className="flex h-full min-h-0 flex-col bg-surface text-fg">
    <div className="artifact-toolbar flex flex-wrap items-center justify-between gap-2 border-b-0 p-3">
      <div><p className="text-caption text-fg-tertiary">{labels[artifact.recipe] ?? artifact.recipe}</p><h2 className="font-serif text-title-3 font-medium">{artifact.output?.title ?? "Artifact"}</h2></div>
      <div className="flex flex-wrap gap-1">
        {!(["mindmap", "flashcards", "quiz"].includes(artifact.recipe)) && <><Button size="sm" variant="secondary" onClick={() => void exportAs("md")}><Icon icon={Download} size={14} />Markdown</Button>
        <Button size="sm" variant="secondary" onClick={() => void exportAs("docx")}><Icon icon={Download} size={14} />DOCX</Button></>}
        {!( ["mindmap", "flashcards", "quiz"].includes(artifact.recipe)) && <Button size="sm" variant="secondary" onClick={() => void exportAs("pdf")}><Icon icon={Download} size={14} />Server PDF</Button>}
        <Button size="sm" variant="secondary" onClick={() => window.print()}><Icon icon={Download} size={14} />Print / PDF</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={async () => { setBusy(true); try { await artifactApi.regenerate(notebookId, artifact.id); await onChanged(); toast.success("Regenerating artifact"); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not regenerate"); } finally { setBusy(false); } }}><Icon icon={RotateCcw} size={14} />Regenerate</Button>
        <Button size="sm" variant="ghost" aria-label="Back to chat" onClick={onClose}>Back to chat</Button>
      </div>
    </div>
    <article className="artifact-document reading-column flex-1 overflow-y-auto px-6 py-8" aria-label="Generated artifact">
      <h1 className="mb-6 font-serif text-title-1 font-medium">{artifact.output?.title}</h1>
      {artifact.output && "sections" in artifact.output && artifact.output.sections.map((section, index) => <section key={`${section.heading}-${index}`} className="mb-8">
        <h2 className="mb-2 font-serif text-title-3 font-semibold">{section.heading}</h2>
        <CitedMarkdown content={section.markdown} citations={artifact.citations} onOpenCitation={(citation, citations) => { onClose(); onOpenCitation(citation, citations); }} />
      </section>)}
      {artifact.recipe === "mindmap" && artifact.output && "root" in artifact.output && <MindMapView root={artifact.output.root} citations={artifact.citations} onOpenCitation={(citation, citations) => { onClose(); onOpenCitation(citation, citations); }} onAskQuestion={(question) => { onClose(); onAskQuestion(question); }} />}
      {artifact.recipe === "flashcards" && artifact.output && "cards" in artifact.output && <FlashcardsView notebookId={notebookId} artifactId={artifact.id} cards={artifact.output.cards} citations={artifact.citations} />}
      {artifact.recipe === "quiz" && artifact.output && "questions" in artifact.output && <QuizView notebookId={notebookId} artifactId={artifact.id} questions={artifact.output.questions} citations={artifact.citations} onOpenCitation={(citation, citations) => { onClose(); onOpenCitation(citation, citations); }} />}
      {artifact.recipe === "audio_overview" && artifact.output && "transcript" in artifact.output && <AudioPlayer notebookId={notebookId} artifactId={artifact.id} transcript={artifact.output.transcript} citations={artifact.citations} onOpenCitation={(citation, citations) => { onClose(); onOpenCitation(citation, citations); }} />}
      <h2 className="mb-2 font-serif text-title-3 font-semibold">Sources</h2>
      <div className="flex flex-wrap gap-2">{artifact.citations.map((citation) => <button type="button" key={citation.n} className="rounded-sm border border-border bg-raised px-2 py-1 text-small text-fg-secondary hover:bg-hover" onClick={() => { onClose(); onOpenCitation(citation, artifact.citations); }}>[S{citation.n}] {citation.source_name}{citation.page_start ? `, p. ${citation.page_start}` : ""}</button>)}</div>
    </article>
  </section>;
}

export function ArtifactStudio({ notebookId, onOpenArtifact }: {
  notebookId: string;
  onOpenArtifact: (artifactId: string) => void;
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
  const readySources = sources.data?.filter((source) => source.status === "ready" && source.selected) ?? [];
  const refresh = () => client.invalidateQueries({ queryKey: ["artifacts", notebookId] });
  const start = async () => {
    if (!recipe || !sourceIds.length) return;
    setCreating(true);
    try {
      const created = await artifactApi.create(notebookId, { recipe, source_ids: sourceIds, language, tone, length, focus, model_override: modelOverride, question_count: questionCount, difficulty });
      setRecipe(null);
      onOpenArtifact(created.id);
      await refresh();
      toast.success("Artifact queued");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not generate artifact"); }
    finally { setCreating(false); }
  };
  const startAll = async () => {
    const available = recipes.data ?? Object.keys(labels).map((id) => ({ id, title: labels[id], renderer_id: "markdown_sections_v1" }));
    if (!readySources.length || !available.length) return;
    setCreating(true);
    const activeRecipes = new Set((artifacts.data ?? []).filter((item) => item.status === "queued" || item.status === "running").map((item) => item.recipe));
    const pending = available.filter((item) => !activeRecipes.has(item.id));
    const source_ids = readySources.map((source) => source.id);
    const results = await Promise.allSettled(pending.map((item) => artifactApi.create(notebookId, {
      recipe: item.id, source_ids, language, tone, length, focus, model_override: modelOverride, question_count: questionCount, difficulty,
    })));
    const created = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const failed = results.filter((result) => result.status === "rejected").length;
    await refresh();
    if (created[0]) onOpenArtifact(created[0].id);
    if (created.length) toast.success(`Queued ${created.length} Studio features in parallel${failed ? `; ${failed} could not be queued` : ""}`);
    else toast.error("No Studio features could be queued");
    setCreating(false);
  };
  return <section aria-label="Studio artifacts" className="space-y-3">
    <div className="flex items-end justify-between gap-2 border-b border-border-subtle pb-2 border-border-subtle"><div><h3 className="font-medium">Create with Studio</h3><p className="text-caption text-fg-secondary">Build from selected sources, or queue every feature in parallel.</p></div><Button size="sm" variant="outline" disabled={!readySources.length || creating || !recipes.data?.length} onClick={() => void startAll()}>{creating ? "Queuing…" : "Generate all"}</Button></div>
    <ul className="grid grid-cols-2 gap-2">
      {(recipes.data ?? Object.entries(labels).map(([id, title]) => ({ id, title, renderer_id: "markdown_sections_v1" }))).map((item) => {
        const visual = recipeStyles[item.id] ?? { icon: Map, color: "text-fg-secondary" };
        const RecipeIcon = visual.icon;
        return <li key={item.id}><button type="button" aria-describedby={`studio-recipe-${item.id}`} disabled={!readySources.length} onClick={() => { setRecipe(item.id); setSourceIds(readySources.map((source) => source.id)); }} className="group flex min-h-18 w-full flex-col items-start justify-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-left transition-colors duration-fast hover:border-border-strong hover:bg-hover focus-ring disabled:cursor-not-allowed disabled:opacity-45">
          <span className="flex items-center gap-2"><Icon icon={RecipeIcon} aria-hidden="true" className={`text-fg-secondary ${visual.color}`} /><span className="text-body font-medium">{item.title}</span></span>
          <span id={`studio-recipe-${item.id}`} className="line-clamp-2 text-caption leading-snug text-fg-secondary">{descriptions[item.id] ?? "Create a source-grounded study artifact."}</span>
        </button></li>;
      })}
    </ul>
    {!readySources.length && <p className="text-small text-fg-secondary">Add a source and wait for it to be ready to generate a document.</p>}
    {artifacts.data?.length ? <div><h3 className="mb-2 border-b border-border-subtle pb-2 text-heading font-semibold">Generated documents</h3><ul className="divide-y divide-border-subtle">{artifacts.data.map((artifact) => <li key={artifact.id} className="py-3">
      <div className="flex items-start justify-between gap-2"><div><button type="button" onClick={() => onOpenArtifact(artifact.id)} className="text-left text-body font-medium hover:text-accent">{artifact.output?.title ?? labels[artifact.recipe] ?? artifact.recipe}</button>{artifact.output && "sections" in artifact.output && artifact.output.sections[0] && <p className="mt-1 line-clamp-2 text-caption leading-relaxed text-fg-secondary">{artifact.output.sections[0].markdown}</p>}</div><span className="text-caption text-fg-tertiary">{artifact.status}</span></div>
      {artifact.status === "running" || artifact.status === "queued" ? <div className="mt-2"><div className="mb-1 text-caption text-fg-secondary">{artifact.stage} · {artifact.progress}%</div><div className="h-1.5 rounded-full bg-sunken"><div className="h-full rounded-full bg-accent transition-[width] duration-base" style={{ width: `${artifact.progress}%` }} /></div></div> : null}
      {artifact.error && <p className="mt-1 text-small text-danger" role="alert">{artifact.error}</p>}
      <div className="mt-1 flex gap-1">{artifact.status === "failed" && <Button size="sm" variant="outline" onClick={async () => { try { await artifactApi.regenerate(notebookId, artifact.id); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not retry"); } }}>Retry</Button>}{artifact.recipe === "audio_overview" && ["queued", "running"].includes(artifact.status) && <Button size="sm" variant="outline" onClick={async () => { try { await artifactApi.cancel(notebookId, artifact.id); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not cancel audio"); } }}><Icon icon={Ban} size={14} /> Cancel</Button>}{["ready", "failed", "cancelled"].includes(artifact.status) && <Button size="sm" variant="ghost" aria-label={`Delete ${artifact.recipe} artifact`} onClick={async () => { try { await artifactApi.remove(notebookId, artifact.id); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete"); } }}><Icon icon={Trash2} size={14} /></Button>}</div>
    </li>)}</ul></div> : null}
    <Dialog open={Boolean(recipe)} onClose={() => setRecipe(null)} title={recipe ? `Generate ${labels[recipe]}` : "Generate artifact"} description="Choose the sources and options for this document." size="md">
      <div className="dialog-options-scroll space-y-4 overflow-y-auto pr-1">
      <fieldset><legend className="mb-2 text-small font-medium">Sources</legend><div className="max-h-32 space-y-1 overflow-y-auto rounded-sm border border-border-subtle p-2">{readySources.map((source) => <label key={source.id} className="flex min-h-11 items-center gap-2 text-body"><Checkbox checked={sourceIds.includes(source.id)} onChange={(event) => setSourceIds((current) => event.target.checked ? [...current, source.id] : current.filter((id) => id !== source.id))} />{source.name}</label>)}</div></fieldset>
      <label className="block space-y-1.5 text-small">Language{recipe === "audio_overview" ? <Select aria-label="Language" value={language} onValueChange={setLanguage}><option>English</option><option>British English</option><option>Spanish</option><option>French</option><option>Hindi</option></Select> : <Input value={language} onChange={(event) => setLanguage(event.target.value)} maxLength={50} />}</label>
      {recipe === "audio_overview" && <label className="block space-y-1.5 text-small">Tone<Select aria-label="Audio tone" value={tone} onValueChange={(value) => setTone(value as typeof tone)}><option value="conversational">Conversational</option><option value="curious">Curious</option><option value="formal">Formal</option></Select></label>}
      <label className="block space-y-1.5 text-small">Length<Select value={length} onValueChange={(value) => setLength(value as typeof length)}><option value="short">Short</option><option value="default">Default</option><option value="long">Long</option></Select></label>
      {recipe === "quiz" && <div className="grid grid-cols-2 gap-3"><label className="block space-y-1.5 text-small">Question count<Select value={String(questionCount)} onValueChange={(value) => setQuestionCount(Number(value))}>{[5, 10, 15, 20].map((count) => <option key={count} value={count}>{count}</option>)}</Select></label><label className="block space-y-1.5 text-small">Difficulty<Select value={difficulty} onValueChange={(value) => setDifficulty(value as typeof difficulty)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></Select></label></div>}
      <label className="block space-y-1.5 text-small">Focus (optional)<Textarea value={focus} onChange={(event) => setFocus(event.target.value)} maxLength={2000} rows={2} /></label>
      <label className="block space-y-1.5 text-small">Model override (optional)<Input value={modelOverride} onChange={(event) => setModelOverride(event.target.value)} placeholder="Use your cheap model" maxLength={200} /></label>
      </div>
      <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setRecipe(null)}>Cancel</Button><Button onClick={() => void start()} disabled={!sourceIds.length || !language.trim() || creating} loading={creating}>{creating ? "Queuing…" : "Generate"}</Button></div>
    </Dialog>
  </section>;
}

export function StudioArtifactView({ notebookId, artifactId, onClose, onOpenCitation, onAskQuestion }: {
  notebookId: string;
  artifactId: string;
  onClose: () => void;
  onOpenCitation: (citation: ChatCitation, citations: ChatCitation[]) => void;
  onAskQuestion: (question: string) => void;
}) {
  const client = useQueryClient();
  const artifacts = useQuery({ queryKey: ["artifacts", notebookId], queryFn: () => artifactApi.list(notebookId), refetchInterval: (query) => query.state.data?.some((item) => item.id === artifactId && (item.status === "queued" || item.status === "running")) ? 1500 : false });
  useArtifactEvents(notebookId);
  const artifact = artifacts.data?.find((item) => item.id === artifactId);
  const refresh = async () => { await client.invalidateQueries({ queryKey: ["artifacts", notebookId] }); };
  if (!artifact) return <section className="flex h-full flex-col" aria-label="Studio result"><div className="border-b-0 p-3"><Button size="sm" variant="ghost" onClick={onClose}>Back to chat</Button></div>{artifacts.isPending ? <div className="m-auto h-10 w-2/3 animate-pulse rounded bg-sunken" aria-label="Loading generated artifact" /> : <div className="m-auto space-y-3 p-6 text-center"><p className="text-body text-fg-secondary">This artifact was deleted or is no longer available.</p><Button variant="outline" onClick={onClose}>Return to chat</Button></div>}</section>;
  if (artifact.status === "queued" || artifact.status === "running") return <section className="flex h-full flex-col" aria-label="Studio result"><div className="flex items-center justify-between border-b-0 p-3"><div><p className="text-caption uppercase tracking-wide text-fg-secondary">Studio</p><h2 className="font-semibold">{labels[artifact.recipe] ?? artifact.recipe}</h2></div><Button size="sm" variant="ghost" onClick={onClose}>Back to chat</Button></div><div className="m-auto w-full max-w-lg space-y-3 p-6"><h3 className="text-title-2 font-semibold">Creating {labels[artifact.recipe] ?? artifact.recipe}</h3><p className="text-body text-fg-secondary">{artifact.stage} · {artifact.progress}%</p><div className="h-2 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${artifact.progress}%` }} /></div></div></section>;
  if (artifact.status !== "ready") return <section className="flex h-full flex-col" aria-label="Studio result"><div className="flex items-center justify-between border-b-0 p-3"><h2 className="font-semibold">{labels[artifact.recipe] ?? artifact.recipe}</h2><Button size="sm" variant="ghost" onClick={onClose}>Back to chat</Button></div><div className="m-auto max-w-lg space-y-3 p-6"><p className="font-medium text-danger">Generation failed</p><p role="alert" className="text-body text-fg-secondary">{artifact.error ?? "The generated result could not be created."}</p><Button onClick={async () => { try { await artifactApi.regenerate(notebookId, artifact.id); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not retry"); } }}>Retry</Button></div></section>;
  return <ArtifactViewer notebookId={notebookId} artifact={artifact} onClose={onClose} onOpenCitation={onOpenCitation} onAskQuestion={onAskQuestion} onChanged={refresh} />;
}
