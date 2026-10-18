import { highlightParts, type TextBlock } from "../lib/source-highlight";

export function SourceTextBlock({ block, start, end }: { block: TextBlock; start?: number; end?: number }) {
  const parts = start !== undefined && end !== undefined ? highlightParts(block, start, end) : null;
  return <p className="whitespace-pre-wrap break-words text-sm leading-7">{parts ? <>{parts.before}{parts.selected && <mark data-citation-highlight className="rounded bg-amber-300 px-0.5 text-slate-950">{parts.selected}</mark>}{parts.after}</> : block.text}</p>;
}
