import { describe, expect, it } from "vitest";
import robots from "./robots";
import sitemap from "./sitemap";

describe("public SEO routes", () => {
  it("lists only public pages in the sitemap", () => {
    const urls = sitemap().map((item) => new URL(item.url).pathname);
    expect(urls).toEqual(["/", "/privacy", "/terms", "/cookies", "/contact"]);
    expect(urls.some((path) => path.includes("workspace") || path.includes("share"))).toBe(false);
  });

  it("keeps private and account routes out of crawler discovery", () => {
    const output = robots();
    const disallowed = output.rules && !Array.isArray(output.rules) ? output.rules.disallow : [];
    expect(disallowed).toEqual(expect.arrayContaining(["/api/", "/workspace/", "/share/", "/settings"]));
  });
});
