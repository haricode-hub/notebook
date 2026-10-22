"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronLeft, Command, PanelLeftClose, PanelRightClose, Settings2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Group, Panel, Separator, type GroupImperativeHandle, type PanelImperativeHandle } from "react-resizable-panels";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons/Icon";
import { Skeleton } from "@/components/ui/feedback";
import { SourcesPanel } from "@/components/sources-panel";
import { ChatPanel } from "@/components/chat-panel";
import { SourceViewer, type ViewerSelection } from "@/components/source-viewer";
import { StudioPanel } from "@/components/studio-panel";
import { StudioArtifactView } from "@/components/artifact-studio";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { SearchInput } from "@/components/ui/input";
import { notebookApi, type ChatCitation, type NotebookUpdate } from "@/lib/api-client";
import { springOptions } from "@/design/springs";
import { useMotionPrefs } from "@/design/use-motion-prefs";
import { projectWorkspaceLayout, rubberBandOffset, type WorkspaceDivider, type WorkspaceLayout } from "@/design/workspace-layout";

type Tab = "Sources" | "Chat" | "Studio";

const panels: { title: Tab; description: string }[] = [
  { title: "Sources", description: "Add a file, website, or text to start researching." },
  { title: "Chat", description: "Ask questions grounded in your sources." },
  { title: "Studio", description: "Read your overview and create notes." },
];

type DividerGesture = { startX: number; lastX: number; lastTime: number; velocityX: number; startSize: number; groupWidth: number; divider: WorkspaceDivider };

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["notebook", id], queryFn: () => notebookApi.get(id) });
  const [tab, setTab] = useState<Tab>("Chat");
  const [tabletSide, setTabletSide] = useState<Exclude<Tab, "Chat">>("Sources");
  const { reducedMotion } = useMotionPrefs();
  const [viewer, setViewer] = useState<ViewerSelection | null>(null);
  const [studioArtifactId, setStudioArtifactId] = useState<string | null>(null);
  const openSource = (sourceId: string) => setViewer({ sourceId, citations: [], index: 0 });
  const openGuide = (sourceId: string) => setViewer({ sourceId, citations: [], index: 0, initialTab: "guide" });
  const openCitation = (citation: ChatCitation, citations: ChatCitation[]) => setViewer({ sourceId: citation.source_id, citations, index: Math.max(0, citations.findIndex((item) => item.chunk_id === citation.chunk_id && item.n === citation.n)) });
  const [suggestedQuestion, setSuggestedQuestion] = useState<{ id: number; text: string } | null>(null);
  const suggestionNumber = useRef(0);
  const askQuestion = (text: string) => { suggestionNumber.current += 1; setSuggestedQuestion({ id: suggestionNumber.current, text }); setTab("Chat"); };
  const openArtifact = (artifactId: string) => { setStudioArtifactId(artifactId); setTab("Chat"); };
  const [desktop, setDesktop] = useState(false);
  const [tablet, setTablet] = useState(false);
  useEffect(() => {
    const desktopMedia = window.matchMedia("(min-width: 1200px)");
    const tabletMedia = window.matchMedia("(min-width: 768px) and (max-width: 1199px)");
    const update = () => { setDesktop(desktopMedia.matches); setTablet(tabletMedia.matches); };
    update();
    desktopMedia.addEventListener("change", update);
    tabletMedia.addEventListener("change", update);
    return () => { desktopMedia.removeEventListener("change", update); tabletMedia.removeEventListener("change", update); };
  }, []);
  const [showSettings, setShowSettings] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [persona, setPersona] = useState<string | null>(null);
  const [responseLength, setResponseLength] = useState<NotebookUpdate["response_length"] | null>(null);
  const sourcesRef = useRef<PanelImperativeHandle>(null);
  const studioRef = useRef<PanelImperativeHandle>(null);
  const groupRef = useRef<GroupImperativeHandle>(null);
  const dividerGesture = useRef<DividerGesture | null>(null);
  const layoutStorageKey = `open-notebook:workspace-layout:v3:${id}`;
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "k" || event.code === "KeyK")) {
        event.preventDefault();
        setCommandQuery("");
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(layoutStorageKey);
      if (saved) {
        const layout = JSON.parse(saved) as WorkspaceLayout;
        if ([layout.sources, layout.chat, layout.studio].every((size) => Number.isFinite(size) && size >= 0 && size <= 100)) {
          groupRef.current?.setLayout(layout);
        }
      }
    } catch {
      try { window.localStorage.removeItem(layoutStorageKey); } catch { /* Storage can be disabled in private browsing. */ }
    }
  }, [layoutStorageKey, query.isSuccess]);
  const beginDividerGesture = (divider: WorkspaceDivider, event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !groupRef.current) return;
    const layout = groupRef.current.getLayout() as WorkspaceLayout;
    const width = document.getElementById("workspace-panels")?.getBoundingClientRect().width ?? 0;
    dividerGesture.current = {
      startX: event.clientX,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocityX: 0,
      startSize: divider === "sources-chat" ? layout.sources : layout.studio,
      groupWidth: width,
      divider,
    };
  };
  const moveDividerGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = dividerGesture.current;
    if (!gesture || gesture.groupWidth <= 0) return;
    const elapsed = event.timeStamp - gesture.lastTime;
    if (elapsed > 0) gesture.velocityX = (event.clientX - gesture.lastX) / elapsed * 1000;
    gesture.lastX = event.clientX;
    gesture.lastTime = event.timeStamp;
    const delta = (event.clientX - gesture.startX) / gesture.groupWidth * 100;
    const layout = groupRef.current?.getLayout() as WorkspaceLayout | undefined;
    if (!layout) return;
    const candidate = gesture.divider === "sources-chat" ? gesture.startSize + delta : gesture.startSize - delta;
    const otherSide = gesture.divider === "sources-chat" ? layout.studio : layout.sources;
    const minimum = gesture.divider === "sources-chat" ? 14 : 22;
    const overrun = candidate - Math.min(100 - otherSide - 25, Math.max(minimum, candidate));
    const directedOffset = gesture.divider === "sources-chat" ? overrun : -overrun;
    const offset = rubberBandOffset(directedOffset * gesture.groupWidth / 100);
    event.currentTarget.style.setProperty("--rubber-offset", `${offset}px`);
    event.currentTarget.dataset.rubber = Math.abs(offset) > 0.25 ? "edge" : "none";
  };
  const endDividerGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = dividerGesture.current;
    dividerGesture.current = null;
    event.currentTarget.style.removeProperty("--rubber-offset");
    delete event.currentTarget.dataset.rubber;
    if (!gesture || !groupRef.current) return;
    const current = groupRef.current.getLayout() as WorkspaceLayout;
    const projected = projectWorkspaceLayout(current, gesture.divider, gesture.velocityX, gesture.groupWidth);
    groupRef.current.setLayout(projected);
    try { window.localStorage.setItem(layoutStorageKey, JSON.stringify(projected)); } catch { /* Storage can be disabled in private browsing. */ }
  };
  const save = useMutation({ mutationFn: (body: NotebookUpdate) => notebookApi.update(id, body), onSuccess: () => { client.invalidateQueries({ queryKey: ["notebook", id] }); toast.success("Notebook preferences saved"); setShowSettings(false); }, onError: (error) => toast.error(error.message) });
  if (query.isPending) return <div className="px-2 pb-2"><Skeleton className="workspace-height rounded-lg" /></div>;
  if (query.isError) return <main className="p-8" role="alert">Could not open notebook. <Link href="/notebooks" className="text-accent underline">Back to notebooks</Link></main>;
  const book = query.data;
  return <main className="workspace-height flex flex-col px-2 pb-2">
    <div className="flex h-12 flex-wrap items-center justify-between gap-2 px-2">
      <div className="flex min-w-0 items-center gap-2"><Link href="/notebooks" aria-label="Back to notebooks" className="focus-ring inline-flex size-8 items-center justify-center rounded-sm text-fg-secondary hover:bg-hover hover:text-fg"><Icon icon={ChevronLeft} /></Link><Icon icon={BookOpen} size={18} className="text-fg-tertiary" /><h1 className="truncate font-serif text-title-3 font-medium">{book.title}</h1></div>
      <div className="flex shrink-0 items-center gap-1"><Button variant="ghost" size="sm" className="hidden workspace-desktop-control" aria-label="Collapse sources" onClick={() => sourcesRef.current?.isCollapsed() ? sourcesRef.current?.expand() : sourcesRef.current?.collapse()}><Icon icon={PanelLeftClose} /> Sources</Button><Button variant="ghost" size="sm" className="hidden workspace-desktop-control" aria-label="Collapse studio" onClick={() => studioRef.current?.isCollapsed() ? studioRef.current?.expand() : studioRef.current?.collapse()}><Icon icon={PanelRightClose} /> Studio</Button><Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)}><Icon icon={Settings2} /> Preferences</Button><Button variant="ghost" size="sm" onClick={() => setCommandOpen(true)} aria-label="Open command menu"><Icon icon={Command} /><span className="hidden lg:inline">Commands</span><kbd className="hidden font-mono text-caption text-fg-tertiary lg:inline">Ctrl K</kbd></Button></div>
    </div>
    <Dialog open={showSettings} onClose={() => setShowSettings(false)} title="Notebook preferences" description="Set the response style for this notebook." size="sm">
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate({ persona: persona ?? book.persona, response_length: responseLength ?? book.response_length as "short" | "medium" | "long" }); }}>
        <div className="space-y-1.5"><Label htmlFor="persona">Assistant persona</Label><Input id="persona" value={persona ?? book.persona ?? ""} onChange={(event) => setPersona(event.target.value)} placeholder="e.g. Explain like a patient tutor" maxLength={4000} /></div>
        <div className="space-y-1.5"><Label htmlFor="response-length">Response length</Label><Select id="response-length" value={responseLength ?? book.response_length} onValueChange={(value) => setResponseLength(value as "short" | "medium" | "long")}><option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option></Select></div>
        <footer className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setShowSettings(false)}>Cancel</Button><Button type="submit" disabled={save.isPending} loading={save.isPending}>Save preferences</Button></footer>
      </form>
    </Dialog>
    <div className="mobile-workspace relative min-h-0 flex-1 md:hidden">
      {!desktop && !tablet && (studioArtifactId ? <StudioArtifactView notebookId={id} artifactId={studioArtifactId} onClose={() => setStudioArtifactId(null)} onOpenCitation={openCitation} onAskQuestion={askQuestion} /> : <ChatPanel notebookId={id} onOpenCitation={openCitation} suggestedQuestion={suggestedQuestion} onQuestionConsumed={() => setSuggestedQuestion(null)} />)}
      <AnimatePresence initial={false}>
        {!desktop && !tablet && tab !== "Chat" && <motion.section
          key={tab}
          aria-label={`${tab} panel`}
          initial={reducedMotion ? { opacity: 0 } : { y: 42, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { y: 42, opacity: 0 }}
          transition={reducedMotion ? { duration: 0 } : springOptions("sheet")}
          drag={reducedMotion ? false : "y"}
          dragDirectionLock
          dragConstraints={{ top: 0, bottom: 260 }}
          dragElastic={0.55}
          dragMomentum={!reducedMotion}
          onDragEnd={(_event, info) => {
            if (info.velocity.y > 450 || info.offset.y > 130) setTab("Chat");
          }}
          className="mobile-sheet absolute inset-x-0 z-20 overflow-hidden rounded-t-lg border border-border bg-surface"
        >
          <div className="mx-auto my-2 h-1.5 w-10 rounded-full bg-border-strong" aria-hidden="true" />
          {tab === "Sources" ? <SourcesPanel notebookId={id} onOpenSource={openSource} onOpenGuide={openGuide} /> : <StudioPanel notebookId={id} onAskQuestion={askQuestion} onOpenCitation={openCitation} onOpenArtifact={openArtifact} />}
        </motion.section>}
      </AnimatePresence>
      <nav className="mobile-tabs absolute inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-border-subtle bg-raised" aria-label="Workspace panels" role="tablist">
        {panels.map((panel) => <button key={panel.title} type="button" role="tab" aria-selected={tab === panel.title} onClick={() => setTab(panel.title)} className={`h-14 px-3 py-2 text-body ${tab === panel.title ? "font-semibold text-fg" : "text-fg-secondary"}`}>{panel.title}</button>)}
      </nav>
    </div>
    {tablet && <div className="workspace-tablet min-h-0 flex-1 gap-2">
      <section className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border-subtle bg-surface" aria-label="Chat panel">
        {studioArtifactId ? <StudioArtifactView notebookId={id} artifactId={studioArtifactId} onClose={() => setStudioArtifactId(null)} onOpenCitation={openCitation} onAskQuestion={askQuestion} /> : <ChatPanel notebookId={id} onOpenCitation={openCitation} suggestedQuestion={suggestedQuestion} onQuestionConsumed={() => setSuggestedQuestion(null)} />}
      </section>
      <aside className="workspace-tablet-side min-h-0 shrink-0 overflow-hidden rounded-lg border border-border-subtle bg-surface">
        <nav className="grid grid-cols-2 border-b border-border-subtle" aria-label="Workspace side panel" role="tablist">
          {(["Sources", "Studio"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={tabletSide === item} onClick={() => setTabletSide(item)} className={`h-10 border-b-2 px-3 text-body ${tabletSide === item ? "border-fg font-semibold text-fg" : "border-transparent text-fg-secondary hover:text-fg"}`}>{item}</button>)}
        </nav>
        <div className="workspace-tablet-panel min-h-0">{tabletSide === "Sources" ? <SourcesPanel notebookId={id} onOpenSource={openSource} onOpenGuide={openGuide} /> : <StudioPanel notebookId={id} onAskQuestion={askQuestion} onOpenCitation={openCitation} onOpenArtifact={openArtifact} />}</div>
      </aside>
    </div>}
    <div className="workspace-desktop min-h-0 flex-1">
    <Group
      orientation="horizontal"
      className="min-h-0 flex-1 gap-2"
      id="workspace-panels"
      groupRef={groupRef}
      defaultLayout={{ sources: 18, chat: 54, studio: 28 }}
      onLayoutChanged={(layout, meta) => {
        if (meta.isUserInteraction) {
          try { window.localStorage.setItem(layoutStorageKey, JSON.stringify(layout)); } catch { /* Storage can be disabled in private browsing. */ }
        }
      }}
    >
      <Panel id="sources" panelRef={sourcesRef} defaultSize="18%" minSize="14%" collapsible collapsedSize="0%" className="overflow-hidden rounded-lg border border-border-subtle bg-surface">{desktop && <SourcesPanel notebookId={id} onOpenSource={openSource} onOpenGuide={openGuide} />}</Panel>
      <Separator
        data-workspace-separator="sources-chat"
        aria-label="Resize sources and chat panels"
        className="workspace-separator w-1 bg-transparent hover:bg-border-strong"
        onPointerDown={(event) => beginDividerGesture("sources-chat", event)}
        onPointerMove={moveDividerGesture}
        onPointerUp={endDividerGesture}
        onPointerCancel={endDividerGesture}
      />
      <Panel id="chat" defaultSize="54%" minSize="25%" className="overflow-hidden rounded-lg border border-border-subtle bg-surface">{desktop && (studioArtifactId ? <StudioArtifactView notebookId={id} artifactId={studioArtifactId} onClose={() => setStudioArtifactId(null)} onOpenCitation={openCitation} onAskQuestion={askQuestion} /> : <ChatPanel notebookId={id} onOpenCitation={openCitation} suggestedQuestion={suggestedQuestion} onQuestionConsumed={() => setSuggestedQuestion(null)} />)}</Panel>
      <Separator
        data-workspace-separator="chat-studio"
        aria-label="Resize chat and studio panels"
        className="workspace-separator w-1 bg-transparent hover:bg-border-strong"
        onPointerDown={(event) => beginDividerGesture("chat-studio", event)}
        onPointerMove={moveDividerGesture}
        onPointerUp={endDividerGesture}
        onPointerCancel={endDividerGesture}
      />
      <Panel id="studio" panelRef={studioRef} defaultSize="28%" minSize="22%" collapsible collapsedSize="0%" className="overflow-hidden rounded-lg border border-border-subtle bg-surface"><StudioPanel notebookId={id} onAskQuestion={askQuestion} onOpenCitation={openCitation} onOpenArtifact={openArtifact} /></Panel>
    </Group>
    </div>
    {viewer && <SourceViewer notebookId={id} selection={viewer} onClose={() => setViewer(null)} onNavigate={(index) => setViewer((current) => current && ({ ...current, index }))} onAskQuestion={askQuestion} />}
    <Dialog open={commandOpen} onClose={() => setCommandOpen(false)} title="Go to" description="Move between the main notebook panels or open preferences." size="sm">
      <SearchInput autoFocus aria-label="Search commands" placeholder="Search panels…" value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} />
      <nav className="mt-3 space-y-1" aria-label="Commands">{(["Chat", "Sources", "Studio", "Preferences"] as const).filter((item) => item.toLowerCase().includes(commandQuery.toLowerCase())).map((item) => <button key={item} type="button" role="menuitem" className="flex min-h-11 w-full items-center rounded-sm px-3 text-left text-body hover:bg-hover focus-ring" onClick={() => { if (item === "Preferences") setShowSettings(true); else { setTab(item); if (item !== "Chat") setTabletSide(item); } if (item === "Sources") sourcesRef.current?.expand(); if (item === "Studio") studioRef.current?.expand(); setCommandOpen(false); }}>{item}</button>)}</nav>
    </Dialog>
  </main>;
}
