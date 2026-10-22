import { highlightParts, type TextBlock } from "../lib/source-highlight";

export function SourceTextBlock({ block, start, end }: { block: TextBlock; start?: number; end?: number }) {
  const parts = start !== undefined && end !== undefined ? highlightParts(block, start, end) : null;
  return <p className="max-w-[68ch] whitespace-pre-wrap break-words text-body leading-relaxed">{parts ? <>{parts.before}{parts.selected && <mark data-citation-highlight className="rounded-xs bg-warning-soft px-0.5 text-fg">{parts.selected}</mark>}{parts.after}</> : block.text}</p>;
}
