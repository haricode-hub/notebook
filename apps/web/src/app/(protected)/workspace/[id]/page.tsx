"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, PanelLeftClose, PanelRightClose, Settings2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Group, Panel, Separator, type PanelImperativeHandle } from "react-resizable-panels";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SourcesPanel } from "@/components/sources-panel";
import { ChatPanel } from "@/components/chat-panel";
import { SourceViewer, type ViewerSelection } from "@/components/source-viewer";
import { StudioPanel } from "@/components/studio-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notebookApi, type ChatCitation, type NotebookUpdate } from "@/lib/api-client";
import { springOptions } from "@/design/springs";
import { useMotionPrefs } from "@/design/use-motion-prefs";

type Tab = "Sources" | "Chat" | "Studio";

const panels: { title: Tab; description: string }[] = [
  { title: "Sources", description: "Add a file, website, or text to start researching." },
  { title: "Chat", description: "Ask questions grounded in your sources." },
  { title: "Studio", description: "Read your overview and create notes." },
];

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["notebook", id], queryFn: () => notebookApi.get(id) });
  const [tab, setTab] = useState<Tab>("Chat");
  const { reducedMotion } = useMotionPrefs();
  const [viewer, setViewer] = useState<ViewerSelection | null>(null);
  const openSource = (sourceId: string) => setViewer({ sourceId, citations: [], index: 0 });
  const openGuide = (sourceId: string) => setViewer({ sourceId, citations: [], index: 0, initialTab: "guide" });
  const openCitation = (citation: ChatCitation, citations: ChatCitation[]) => setViewer({ sourceId: citation.source_id, citations, index: Math.max(0, citations.findIndex((item) => item.chunk_id === citation.chunk_id && item.n === citation.n)) });
  const [suggestedQuestion, setSuggestedQuestion] = useState<{ id: number; text: string } | null>(null);
  const suggestionNumber = useRef(0);
  const askQuestion = (text: string) => { suggestionNumber.current += 1; setSuggestedQuestion({ id: suggestionNumber.current, text }); setTab("Chat"); };
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [showSettings, setShowSettings] = useState(false);
  const [persona, setPersona] = useState<string | null>(null);
  const [responseLength, setResponseLength] = useState<NotebookUpdate["response_length"] | null>(null);
  const sourcesRef = useRef<PanelImperativeHandle>(null);
  const studioRef = useRef<PanelImperativeHandle>(null);
  const save = useMutation({ mutationFn: (body: NotebookUpdate) => notebookApi.update(id, body), onSuccess: () => { client.invalidateQueries({ queryKey: ["notebook", id] }); toast.success("Notebook preferences saved"); setShowSettings(false); }, onError: (error) => toast.error(error.message) });
  if (query.isPending) return <div className="mx-5 mt-8 h-[75vh] animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" aria-label="Loading workspace" />;
  if (query.isError) return <main className="p-8" role="alert">Could not open notebook. <Link href="/notebooks" className="text-indigo-600 underline">Back to notebooks</Link></main>;
  const book = query.data;
  return <main className="flex h-[calc(100dvh-61px)] flex-col">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex min-w-0 items-center gap-2"><Link href="/notebooks" aria-label="Back to notebooks" className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft /></Link><h1 className="truncate font-semibold">{book.title}</h1></div>
      <div className="flex items-center gap-1"><Button variant="ghost" size="sm" className="hidden md:inline-flex" aria-label="Collapse sources" onClick={() => sourcesRef.current?.isCollapsed() ? sourcesRef.current?.expand() : sourcesRef.current?.collapse()}><PanelLeftClose /> Sources</Button><Button variant="ghost" size="sm" className="hidden md:inline-flex" aria-label="Collapse studio" onClick={() => studioRef.current?.isCollapsed() ? studioRef.current?.expand() : studioRef.current?.collapse()}><PanelRightClose /> Studio</Button><Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)}><Settings2 /> Preferences</Button></div>
    </div>
    {showSettings && <form className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-[1fr_auto_auto]" onSubmit={(event) => { event.preventDefault(); save.mutate({ persona: persona ?? book.persona, response_length: responseLength ?? book.response_length as "short" | "medium" | "long" }); }}>
      <div><Label htmlFor="persona">Assistant persona</Label><Input id="persona" value={persona ?? book.persona ?? ""} onChange={(event) => setPersona(event.target.value)} placeholder="e.g. Explain like a patient tutor" maxLength={4000} /></div>
      <div><Label htmlFor="response-length">Response length</Label><select id="response-length" className="block h-9 rounded-md border bg-white px-3 text-sm text-slate-900 dark:bg-slate-800 dark:text-white" value={responseLength ?? book.response_length} onChange={(event) => setResponseLength(event.target.value as "short" | "medium" | "long")}><option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option></select></div>
      <Button type="submit" className="self-end" disabled={save.isPending}>Save</Button>
    </form>}
    <div className="flex border-b border-slate-200 md:hidden dark:border-slate-800" role="tablist" aria-label="Workspace panels">{panels.map((panel) => <button key={panel.title} type="button" role="tab" aria-selected={tab === panel.title} onClick={() => setTab(panel.title)} className={`flex-1 px-4 py-3 text-sm ${tab === panel.title ? "border-b-2 border-indigo-600 font-semibold text-indigo-600" : "text-slate-500"}`}>{panel.title}</button>)}</div>
    <div className="relative min-h-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:hidden">
      {!desktop && <ChatPanel notebookId={id} onOpenCitation={openCitation} suggestedQuestion={suggestedQuestion} onQuestionConsumed={() => setSuggestedQuestion(null)} />}
      <AnimatePresence initial={false}>
        {!desktop && tab !== "Chat" && <motion.section
          key={tab}
          aria-label={`${tab} panel`}
          initial={reducedMotion ? { opacity: 0 } : { y: 42, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { y: 42, opacity: 0 }}
          transition={reducedMotion ? { duration: 0.01 } : springOptions("sheet")}
          drag={reducedMotion ? false : "y"}
          dragDirectionLock
          dragConstraints={{ top: 0, bottom: 260 }}
          dragElastic={0.55}
          dragMomentum={!reducedMotion}
          onDragEnd={(_event, info) => {
            if (info.velocity.y > 450 || info.offset.y > 130) setTab("Chat");
          }}
          className="absolute inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 h-[min(72dvh,42rem)] overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950"
        >
          <div className="mx-auto my-2 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden="true" />
          {tab === "Sources" ? <SourcesPanel notebookId={id} onOpenSource={openSource} onOpenGuide={openGuide} /> : <StudioPanel notebookId={id} onAskQuestion={askQuestion} onOpenCitation={openCitation} />}
        </motion.section>}
      </AnimatePresence>
      <nav className="absolute inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-slate-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90" aria-label="Notebook workspace" role="tablist">
        {panels.map((panel) => <button key={panel.title} type="button" role="tab" aria-selected={tab === panel.title} onClick={() => setTab(panel.title)} className={`min-h-11 px-3 py-2 text-sm ${tab === panel.title ? "font-semibold text-indigo-600 dark:text-indigo-400" : "text-slate-500"}`}>{panel.title}</button>)}
      </nav>
    </div>
    <div className="hidden min-h-0 flex-1 md:flex">
    <Group orientation="horizontal" className="min-h-0 flex-1" id="workspace-panels">
      <Panel id="sources" panelRef={sourcesRef} defaultSize="25%" minSize="15%" collapsible collapsedSize="0%">{desktop && <SourcesPanel notebookId={id} onOpenSource={openSource} onOpenGuide={openGuide} />}</Panel>
      <Separator className="w-1 bg-slate-200 transition-colors hover:bg-indigo-400 dark:bg-slate-800" />
      <Panel id="chat" defaultSize="50%" minSize="25%">{desktop && <ChatPanel notebookId={id} onOpenCitation={openCitation} suggestedQuestion={suggestedQuestion} onQuestionConsumed={() => setSuggestedQuestion(null)} />}</Panel>
      <Separator className="w-1 bg-slate-200 transition-colors hover:bg-indigo-400 dark:bg-slate-800" />
      <Panel id="studio" panelRef={studioRef} defaultSize="25%" minSize="15%" collapsible collapsedSize="0%"><StudioPanel notebookId={id} onAskQuestion={askQuestion} onOpenCitation={openCitation} /></Panel>
    </Group>
    </div>
    {viewer && <SourceViewer notebookId={id} selection={viewer} onClose={() => setViewer(null)} onNavigate={(index) => setViewer((current) => current && ({ ...current, index }))} onAskQuestion={askQuestion} />}
  </main>;
}
