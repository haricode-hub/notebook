export type TextBlock = { start: number; end: number; text: string };

export function splitTextBlocks(text: string, maxChars = 2400): TextBlock[] {
  if (!text) return [];
  const blocks: TextBlock[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const newline = text.lastIndexOf("\n", end);
      if (newline > start + maxChars / 2) end = newline + 1;
      else {
        const space = text.lastIndexOf(" ", end);
        if (space > start + maxChars / 2) end = space + 1;
      }
    }
    blocks.push({ start, end, text: text.slice(start, end) });
    start = end;
  }
  return blocks;
}

export function highlightParts(block: TextBlock, start: number, end: number) {
  const left = Math.max(block.start, Math.min(block.end, start));
  const right = Math.max(left, Math.max(block.start, Math.min(block.end, end)));
  return {
    before: block.text.slice(0, left - block.start),
    selected: block.text.slice(left - block.start, right - block.start),
    after: block.text.slice(right - block.start),
  };
}

export function matchingPdfItems(items: string[], quote: string): Set<number> {
  const normalize = (value: string) => value.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
  const normalized = items.map(normalize);
  const offsets: { start: number; end: number }[] = [];
  let page = "";
  for (const item of normalized) {
    const start = page.length;
    page += item;
    offsets.push({ start, end: page.length });
  }
  const excerpt = normalize(quote);
  if (!excerpt) return new Set();
  let start = page.indexOf(excerpt);
  let end = start < 0 ? -1 : start + excerpt.length;
  if (start < 0) {
    const first = excerpt.slice(0, 80);
    const last = excerpt.slice(-80);
    start = page.indexOf(first);
    end = page.indexOf(last, Math.max(0, start));
    if (start < 0 || end < 0) return new Set();
    end += last.length;
  }
  return new Set(offsets.flatMap((item, index) => item.end > start && item.start < end ? [index] : []));
}
