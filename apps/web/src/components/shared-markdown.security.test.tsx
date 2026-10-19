import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SharedMarkdown } from "./shared-markdown";

describe("shared markdown security", () => {
  it("keeps HTML and script payloads inert", () => {
    const html = renderToStaticMarkup(
      <SharedMarkdown content={'<img src=x onerror="alert(1)"><script>alert(2)</script>'} />,
    );

    expect(html).not.toMatch(/<(?:script|img)\b/i);
    expect(html).not.toContain('onerror="');
    expect(html).toContain("&lt;img");
  });
});
