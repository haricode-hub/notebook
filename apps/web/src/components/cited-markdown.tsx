"use client";

import { useState } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatCitation } from "@/lib/api-client";

export function CitationChip({ citation, onOpen }: { citation: ChatCitation; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  return <span className="group relative inline-block align-baseline">
    <button type="button" aria-label={`Source ${citation.n}: ${citation.source_name}${citation.time_start != null ? ` at ${formatMediaTime(citation.time_start)}` : ""}`} onClick={onOpen} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} className="mx-0.5 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-200 dark:bg-indigo-900 dark:text-indigo-100">S{citation.n}{citation.time_start != null ? ` ${formatMediaTime(citation.time_start)}` : ""}</button>
    <span role="note" className={`${open ? "block" : "hidden group-hover:block group-focus-within:block"} absolute bottom-full left-0 z-30 mb-2 w-64 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200`}>
      <strong className="block truncate">{citation.source_name}{citation.page_start ? ` · page ${citation.page_start}` : ""}{citation.time_start != null ? ` · ${formatMediaTime(citation.time_start)}` : ""}</strong>
      <span className="mt-1 block max-h-32 overflow-y-auto">{citation.quote}</span>
    </span>
  </span>;
}

export function formatMediaTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function CitedMarkdown({ content, citations, onOpenCitation }: {
  content: string;
  citations: ChatCitation[];
  onOpenCitation: (citation: ChatCitation, citations: ChatCitation[]) => void;
}) {
  const byNumber = new Map(citations.map((citation) => [citation.n, citation]));
  const markdown = content.replace(/\[S(\d+)\]/g, (marker, rawNumber: string) => byNumber.has(Number(rawNumber)) ? `[${marker}](cite:${rawNumber})` : marker);
  return <div className="space-y-2 break-words text-sm leading-relaxed [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_table]:block [&_table]:overflow-x-auto [&_ul]:ml-5 [&_ul]:list-disc">
    <Markdown remarkPlugins={[remarkGfm]} urlTransform={(url) => url.startsWith("cite:") ? url : defaultUrlTransform(url)} components={{ a: ({ href, children }) => {
      if (href?.startsWith("cite:")) {
        const citation = byNumber.get(Number(href.slice(5)));
        return citation ? <CitationChip citation={citation} onOpen={() => onOpenCitation(citation, citations)} /> : <>{children}</>;
      }
      return <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline dark:text-indigo-400">{children}</a>;
    } }}>{markdown}</Markdown>
  </div>;
}
