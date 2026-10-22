"use client";

import { useState } from "react";
import { Check, Command, Plus } from "lucide-react";
import { Icon } from "@/components/icons/Icon";
import { Badge, Chip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Tabs, Toggle } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/dialog";
import { InlineBanner, Skeleton, Spinner } from "@/components/ui/feedback";
import { IconButton } from "@/components/ui/icon-button";
import { Input, SearchInput, Select, Textarea } from "@/components/ui/input";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Material } from "@/components/ui/material";
import { Tooltip } from "@/components/ui/tooltip";

function PrimitiveShowcase() {
  const [enabled, setEnabled] = useState(true);
  const [tab, setTab] = useState("overview");
  const [dialogOpen, setDialogOpen] = useState(false);
  return <div className="min-w-0 space-y-6 rounded-lg border border-border-subtle bg-canvas p-5 text-fg">
    <header className="flex items-center justify-between border-b border-border-subtle pb-4">
      <div><p className="text-overline text-fg-tertiary">OpenNotebook Studio · Design preview</p><h1 className="mt-1 font-serif text-title-2">Primitive inventory</h1></div>
      <IconButton label="Commands" icon={Command} />
    </header>
    <section className="space-y-3"><h2 className="text-heading">Actions and states</h2><div className="flex flex-wrap items-center gap-2"><Button><Icon icon={Plus} size={14} />Primary</Button><Button variant="secondary">Secondary</Button><Button variant="outline">Outline</Button><Button variant="ghost">Ghost</Button><Button variant="destructive">Delete</Button><Button loading>Loading</Button><Button disabled>Disabled</Button></div></section>
    <section className="space-y-3"><h2 className="text-heading">Fields</h2><div className="grid gap-3 sm:grid-cols-2"><Input placeholder="Text input" aria-label="Text input" /><SearchInput placeholder="Search sources" aria-label="Search sources" /><Select aria-label="Model"><option>Default model</option><option>Alternative model</option></Select><Input aria-label="Invalid input" aria-invalid="true" placeholder="Invalid state" /><Textarea aria-label="Notes" placeholder="Write a note…" /></div></section>
    <section className="space-y-3"><h2 className="text-heading">Selection and navigation</h2><div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 text-body"><Checkbox defaultChecked />Selected</label><label className="flex items-center gap-2 text-body"><Checkbox />Unselected</label><Toggle checked={enabled} onCheckedChange={setEnabled} label="Preview toggle" /><Tabs label="Preview tabs" items={[{ value: "overview", label: "Overview" }, { value: "sources", label: "Sources" }, { value: "notes", label: "Notes" }]} value={tab} onValueChange={setTab} /></div></section>
    <section className="space-y-3"><h2 className="text-heading">Feedback and surfaces</h2><div className="flex flex-wrap gap-2"><Badge>Neutral</Badge><Badge variant="success">Ready</Badge><Badge variant="warning">Queued</Badge><Badge variant="danger">Failed</Badge><Chip selected>Selected filter</Chip><Chip>Filter</Chip><Tooltip label="A concise tooltip"><Button variant="secondary">Hover or focus</Button></Tooltip><Spinner /><Button variant="outline" onClick={() => setDialogOpen(true)}>Open dialog</Button></div><div className="grid gap-2 sm:grid-cols-2"><InlineBanner tone="success"><span className="flex items-center gap-2"><Icon icon={Check} size={14} />Source is ready.</span></InlineBanner><InlineBanner tone="warning">A long task is still running.</InlineBanner><InlineBanner tone="danger">The request could not be completed.</InlineBanner><Skeleton className="h-10" /></div></section>
    <section className="space-y-3"><h2 className="text-heading">Menu and material</h2><div className="flex flex-wrap items-start gap-4"><Menu><MenuItem shortcut="⌘K">Open command palette</MenuItem><MenuItem>Rename notebook</MenuItem><MenuItem destructive>Delete notebook</MenuItem></Menu><Material className="min-h-20 min-w-40 rounded-md border border-border p-4 text-small">Material surface</Material></div></section>
    <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Dialog primitive" description="Surface, focus, and spacing preview." size="sm"><div className="flex justify-end"><Button onClick={() => setDialogOpen(false)}>Done</Button></div></Dialog>
  </div>;
}

export default function DesignPreviewPage() {
  return <main className="min-h-dvh bg-canvas p-4 text-fg sm:p-6">
    <div className="mx-auto max-w-screen-2xl space-y-4">
      <p className="text-small text-fg-secondary">Temporary visual check · both themes · resize to inspect the mobile stack.</p>
      <div className="grid items-start gap-4 xl:grid-cols-2"><div data-theme="light"><PrimitiveShowcase /></div><div data-theme="dark"><PrimitiveShowcase /></div></div>
    </div>
  </main>;
}
