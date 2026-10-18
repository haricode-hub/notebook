"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, PanelLeftClose, PanelRightClose, Settings2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Group, Panel, Separator, type PanelImperativeHandle } from "react-resizable-panels";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notebookApi, type NotebookUpdate } from "@/lib/api-client";

type Tab = "Sources" | "Chat" | "Studio";

function EmptyPanel({ title, description }: { title: Tab; description: string }) {
  return <div className="flex h-full flex-col items-center justify-center px-6 text-center"><div className="mb-4 rounded-2xl bg-indigo-50 px-4 py-3 text-2xl dark:bg-indigo-950">{title === "Sources" ? "◫" : title === "Chat" ? "✧" : "◈"}</div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 max-w-xs text-sm text-slate-500">{description}</p></div>;
}

const panels: { title: Tab; description: string }[] = [
  { title: "Sources", description: "Your sources will appear here when source upload arrives in Level 2." },
  { title: "Chat", description: "Ask questions grounded in your sources when chat arrives in Level 4." },
  { title: "Studio", description: "Study guides and other artifacts will appear here in later levels." },
];

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["notebook", id], queryFn: () => notebookApi.get(id) });
  const [tab, setTab] = useState<Tab>("Chat");
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
    <div className="min-h-0 flex-1 md:hidden">{panels.filter((panel) => panel.title === tab).map((panel) => <EmptyPanel key={panel.title} {...panel} />)}</div>
    <div className="hidden min-h-0 flex-1 md:flex">
    <Group orientation="horizontal" className="min-h-0 flex-1" id="workspace-panels">
      <Panel id="sources" panelRef={sourcesRef} defaultSize="25%" minSize="15%" collapsible collapsedSize="0%"><EmptyPanel {...panels[0]} /></Panel>
      <Separator className="w-1 bg-slate-200 transition-colors hover:bg-indigo-400 dark:bg-slate-800" />
      <Panel id="chat" defaultSize="50%" minSize="25%"><EmptyPanel {...panels[1]} /></Panel>
      <Separator className="w-1 bg-slate-200 transition-colors hover:bg-indigo-400 dark:bg-slate-800" />
      <Panel id="studio" panelRef={studioRef} defaultSize="25%" minSize="15%" collapsible collapsedSize="0%"><EmptyPanel {...panels[2]} /></Panel>
    </Group>
    </div>
  </main>;
}
