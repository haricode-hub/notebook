import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReadinessView } from "./readiness";

describe("readiness page", () => {
  it("shows API and embedding health", () => {
    const html = renderToStaticMarkup(<ReadinessView readiness={{ status: "ok", db: "ok", redis: "ok", embed: "ok" }} />);
    expect(html).toContain("API ok");
    expect(html).toContain("Embeddings ok");
  });
  it("shows unavailable when API cannot be reached", () => {
    const html = renderToStaticMarkup(<ReadinessView readiness={null} />);
    expect(html).toContain("API down");
  });
});
