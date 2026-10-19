import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CitedMarkdown } from "./cited-markdown";

describe("cited markdown security", () => {
  it("keeps inline HTML inert and filters javascript URLs", () => {
    const html = renderToStaticMarkup(
      <CitedMarkdown
        content={'<img src=x onerror="alert(1)"><script>alert(2)</script> [bad](javascript:alert%281%29)'}
        citations={[]}
        onOpenCitation={vi.fn()}
      />,
    );

    expect(html).not.toMatch(/<(?:script|img)\b/i);
    expect(html).not.toContain('onerror="');
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("href=\"javascript:");
  });

  it("renders hostile source names as text in citation cards", () => {
    const html = renderToStaticMarkup(
      <CitedMarkdown
        content="Claim [S1]"
        citations={[{
          n: 1,
          chunk_id: "chunk",
          source_id: "source",
          source_name: '<svg onload="alert(1)">',
          page_start: null,
          char_start: 0,
          char_end: 1,
          quote: "safe quote",
        }]}
        onOpenCitation={vi.fn()}
      />,
    );

    expect(html).not.toMatch(/<svg\b/i);
    expect(html).not.toContain('onload="');
    expect(html).toContain("&lt;svg");
  });
});
