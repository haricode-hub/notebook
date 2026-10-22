"use client";

import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ChatCitation } from "@/lib/api-client";

type TreeNode = { label: string; summary: string; source_refs: number[]; children?: TreeNode[] };
type FlowNodeData = { label: string; summary: string; source_refs: number[]; has_children: boolean; collapsed: boolean };

function flatten(root: TreeNode, citations: ChatCitation[], collapsed: Set<string>) {
  const nodes: Node<FlowNodeData>[] = [];
  const edges: Edge[] = [];
  let leaf = 0;
  const visit = (node: TreeNode, id: string, depth: number, parent?: string): number => {
    const start = leaf;
    const children = node.children ?? [];
    const visibleChildren = collapsed.has(id) ? [] : children;
    if (!visibleChildren.length) leaf += 1;
    else visibleChildren.forEach((child, index) => visit(child, `${id}-${index}`, depth + 1, id));
    const end = leaf - 1;
    const y = visibleChildren.length ? (start + end) * 60 : start * 120;
    const usableRefs = node.source_refs.filter((ref) => citations.some((item) => item.n === ref));
    nodes.push({ id, position: { x: depth * 240, y }, data: { label: node.label, summary: node.summary, source_refs: usableRefs, has_children: children.length > 0, collapsed: collapsed.has(id) }, type: "default" });
    if (parent) edges.push({ id: `${parent}-${id}`, source: parent, target: id, type: "smoothstep" });
    return y;
  };
  visit(root, "root", 0);
  return { nodes, edges };
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dataUrlToBlob(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("The mind map export returned invalid data.");
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  const mimeType = header.match(/^data:([^;,]+)/)?.[1] ?? "application/octet-stream";
  if (header.includes(";base64")) {
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: mimeType });
  }
  return new Blob([decodeURIComponent(payload)], { type: mimeType });
}

export default function MindMapView({ root, citations, onOpenCitation, onAskQuestion }: {
  root: TreeNode; citations: ChatCitation[];
  onOpenCitation: (citation: ChatCitation, citations: ChatCitation[]) => void;
  onAskQuestion: (question: string) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<(FlowNodeData & { id: string }) | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [exportError, setExportError] = useState<string | null>(null);
  const graph = useMemo(() => flatten(root, citations, collapsed), [root, citations, collapsed]);
  const selectedCitations = citations.filter((citation) => selected?.source_refs.includes(citation.n));
  const exportMap = async (format: "png" | "svg") => {
    if (!canvas.current) return;
    setExportError(null);
    try {
      const backgroundColor = getComputedStyle(document.body).backgroundColor;
      const data = format === "png" ? await toPng(canvas.current, { backgroundColor, pixelRatio: 2 }) : await toSvg(canvas.current, { backgroundColor });
      download(dataUrlToBlob(data), `mind-map.${format}`);
    } catch {
      setExportError(`Could not export the mind map as ${format.toUpperCase()}. Try again after the map finishes rendering.`);
    }
  };
  return <section className="space-y-2" aria-label="Mind map">
    <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void exportMap("png")}>Export PNG</Button><Button size="sm" variant="outline" onClick={() => void exportMap("svg")}>Export SVG</Button></div>
    {exportError && <p role="alert" className="text-small text-danger">{exportError}</p>}
    <div ref={canvas} className="mindmap-canvas-size min-h-72 w-full rounded-md border border-border bg-raised" data-testid="mindmap-canvas">
      <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView minZoom={0.15} maxZoom={2} onNodeClick={(_, node) => setSelected({ ...node.data, id: node.id })}><Background /><Controls /></ReactFlow>
    </div>
    {selected && <aside className="rounded border p-3" aria-label="Selected mind map node"><h3 className="font-semibold">{selected.label}</h3><p className="my-2 text-body">{selected.summary}</p><div className="flex flex-wrap gap-2">{selectedCitations.map((citation) => <button key={citation.n} type="button" className="text-caption text-accent underline" onClick={() => onOpenCitation(citation, citations)}>[S{citation.n}] {citation.source_name}</button>)}</div><div className="mt-2 flex gap-2"><Button size="sm" onClick={() => onAskQuestion(`Explain “${selected.label}” using my sources. ${selected.summary}`)}>Ask about this</Button>{selected.has_children && <Button size="sm" variant="outline" onClick={() => setCollapsed((old) => { const next = new Set(old); if (next.has(selected.id)) next.delete(selected.id); else next.add(selected.id); return next; })}>{selected.collapsed ? "Expand" : "Collapse"}</Button>}</div></aside>}
  </section>;
}
