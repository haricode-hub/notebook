"use client";

import { Icon } from "@/components/icons/Icon";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getToken, type ChatCitation, type SourceContent } from "@/lib/api-client";
import { matchingPdfItems } from "@/lib/source-highlight";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export default function PdfOriginal({ content, citation, onShowText }: {
  content: SourceContent;
  citation?: ChatCitation;
  onShowText: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(740);
  const [pageItems, setPageItems] = useState<Record<number, string[]>>({});
  const [fallbackExpired, setFallbackExpired] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);
  const file = useMemo(() => token && content.file_url ? {
    url: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}${content.file_url}`,
    httpHeaders: { Authorization: `Bearer ${token}` },
  } : null, [content.file_url, token]);
  const chunk = content.chunks.find((item) => item.id === citation?.chunk_id);
  const quote = chunk?.text ?? citation?.quote ?? "";
  const citedPage = citation?.page_start ?? chunk?.page_start ?? 1;
  const matches = useMemo(() => Object.fromEntries(Object.entries(pageItems).map(([page, items]) => [Number(page), matchingPdfItems(items, quote)])) as Record<number, Set<number>>, [pageItems, quote]);

  useEffect(() => { void getToken().then(setToken).catch(() => setToken(null)); }, []);
  useEffect(() => {
    const element = parentRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const virtualizer = useVirtualizer({
    count: numPages,
    getScrollElement: () => parentRef.current,
    estimateSize: () => Math.max(550, Math.min(width - 32, 790) * zoom * 1.42 + 30),
    overscan: 2,
  });
  const jumpTo = useCallback((page: number) => {
    const safe = Number.isFinite(page) ? Math.max(1, Math.min(numPages, page)) : 1;
    setPageNumber(safe);
    setPageInput(String(safe));
    virtualizer.scrollToIndex(safe - 1, { align: "start" });
  }, [numPages, virtualizer]);
  useEffect(() => { if (numPages) jumpTo(citedPage); }, [numPages, citedPage, citation?.chunk_id, jumpTo]);
  useEffect(() => { virtualizer.measure(); }, [zoom, virtualizer]);
  useEffect(() => {
    setFallbackExpired(false);
    if (!citation) return;
    const timer = setTimeout(() => setFallbackExpired(true), 5_000);
    return () => clearTimeout(timer);
  }, [citation, citedPage]);

  const onText = useCallback((page: number, items: string[]) => {
    setPageItems((current) => current[page]?.join("\u0000") === items.join("\u0000") ? current : ({ ...current, [page]: items }));
  }, []);
  const citationNotFound = !pageItems[citedPage] || (matches[citedPage]?.size ?? 0) === 0;
  const showFallback = Boolean(citation && citationNotFound && (fallbackExpired || pageItems[citedPage]));

  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-3 py-2 text-body border-border-subtle">
      <div className="flex items-center gap-1"><Button size="sm" variant="outline" aria-label="Previous page" disabled={pageNumber <= 1} onClick={() => jumpTo(pageNumber - 1)}><Icon icon={ChevronLeft} className="size-4" /></Button><form className="flex items-center gap-1" onSubmit={(event) => { event.preventDefault(); jumpTo(Number(pageInput)); }}><label htmlFor="pdf-page-input">Page</label><Input id="pdf-page-input" aria-label="Jump to PDF page" type="number" min="1" max={numPages} value={pageInput} onChange={(event) => setPageInput(event.target.value)} className="w-14 text-center" /><span aria-label="PDF page count">of {numPages || "…"}</span></form><Button size="sm" variant="outline" aria-label="Next page" disabled={pageNumber >= numPages} onClick={() => jumpTo(pageNumber + 1)}><Icon icon={ChevronRight} className="size-4" /></Button></div>
      <div className="flex items-center gap-1"><Button size="sm" variant="outline" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, value - 0.2))}><Icon icon={Minus} className="size-4" /></Button><span>{Math.round(zoom * 100)}%</span><Button size="sm" variant="outline" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom((value) => Math.min(2, value + 0.2))}><Icon icon={Plus} className="size-4" /></Button></div>
    </div>
    {showFallback && <div role="note" className="m-3 rounded border border-warning bg-warning-soft p-3 text-body text-fg">The exact PDF text could not be located on page {citedPage}. <button type="button" className="font-semibold text-accent underline" onClick={onShowText}>Show highlighted extracted text</button><p className="mt-1 line-clamp-3">{quote.slice(0, 240)}</p></div>}
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto bg-sunken p-3 bg-surface" aria-label="PDF pages">
      {!file ? <p role="status">Loading PDF access…</p> : <Document file={file} loading={<p role="status">Opening PDF…</p>} error={<p role="alert">Could not open the PDF. Try reopening the source.</p>} onLoadSuccess={({ numPages: count }) => setNumPages(count)}>
        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const page = item.index + 1;
            return <div key={item.key} data-index={item.index} data-pdf-page={page} ref={virtualizer.measureElement} className="absolute left-0 top-0 flex w-full justify-center pb-4" style={{ transform: `translateY(${item.start}px)` }}>
              <div className="bg-raised shadow-sm"><Page key={`${page}:${citation?.chunk_id ?? citation?.n ?? "none"}:${pageItems[page]?.length ?? 0}`} pageNumber={page} width={Math.max(300, Math.min(width - 32, 790) * zoom)} renderAnnotationLayer renderTextLayer onGetTextSuccess={({ items }) => onText(page, items.map((item) => "str" in item ? item.str : ""))} customTextRenderer={({ str, itemIndex }) => matches[page]?.has(itemIndex) ? `<mark data-citation-highlight class="bg-warning-soft text-fg">${escapeHtml(str)}</mark>` : escapeHtml(str)} /></div>
            </div>;
          })}
        </div>
      </Document>}
    </div>
  </div>;
}
