import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceTextBlock } from "./source-text-block";
import { matchingPdfItems, splitTextBlocks } from "../lib/source-highlight";

describe("source citation highlighting", () => {
  it("locates twenty passages sampled from the evaluation documents", () => {
    const evalRoot = resolve(process.cwd(), "../../evals");
    const questions = (JSON.parse(readFileSync(resolve(evalRoot, "questions.json"), "utf8")) as { source: string; expected_fact: string }[]).slice(0, 15);
    const extra = readFileSync(resolve(evalRoot, "docs/solar.md"), "utf8").split("\n\n").slice(1, 6).map((paragraph) => ({ source: "solar", expected_fact: paragraph.slice(0, 28) }));
    const samples = [...questions, ...extra];
    expect(samples).toHaveLength(20);
    for (const sample of samples) {
      const document = readFileSync(resolve(evalRoot, `docs/${sample.source}.md`), "utf8");
      const start = document.indexOf(sample.expected_fact);
      expect(start).toBeGreaterThanOrEqual(0);
      const html = splitTextBlocks(document, 80).map((block) => renderToStaticMarkup(<SourceTextBlock block={block} start={start} end={start + sample.expected_fact.length} />)).join("");
      const highlighted = [...html.matchAll(/<mark[^>]*>(.*?)<\/mark>/g)].map((match) => match[1]).join("");
      expect(highlighted).toBe(sample.expected_fact);
      const paragraph = document.split("\n\n").find((item) => item.includes(sample.expected_fact));
      expect(paragraph).toBeDefined();
      expect(matchingPdfItems(paragraph?.match(/.{1,35}/g) ?? [], sample.expected_fact).size).toBeGreaterThan(0);
    }
  });

  it("preserves exact offsets across virtual text blocks", () => {
    const text = Array.from({ length: 20 }, (_, index) => `Page ${index + 1}: the exact fact is FACT-${index + 1}.\n`).join("");
    const blocks = splitTextBlocks(text, 45);
    expect(blocks.map((block) => block.text).join("")).toBe(text);
    for (let index = 1; index <= 20; index++) {
      const fact = `FACT-${index}`;
      const start = text.indexOf(fact);
      const html = blocks.map((block) => renderToStaticMarkup(<SourceTextBlock block={block} start={start} end={start + fact.length} />)).join("");
      expect(html).toContain(`<mark data-citation-highlight="true" class="rounded bg-amber-300 px-0.5 text-slate-950">${fact}</mark>`);
    }
  });

  it("escapes source HTML and does not create a false highlight", () => {
    const html = renderToStaticMarkup(<SourceTextBlock block={{ start: 0, end: 16, text: "<script>bad</script>" }} start={100} end={110} />);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<mark");
  });

  it("matches PDF text items by the cited beginning and end", () => {
    const items = ["Unrelated introduction", "The first cited fact", "continues on this line", "and ends here", "Other text"];
    expect([...matchingPdfItems(items, "The first cited fact continues on this line and ends here")]).toEqual([1, 2, 3]);
    expect(matchingPdfItems(items, "A fabricated claim").size).toBe(0);
    for (let index = 1; index <= 20; index++) {
      const sentence = `Page ${index} documents a unique finding number ${index}.`;
      const sample = ["Heading", `Page ${index} documents`, `a unique finding number ${index}.`, "Footer"];
      expect([...matchingPdfItems(sample, sentence)]).toEqual([1, 2]);
    }
  });
});
