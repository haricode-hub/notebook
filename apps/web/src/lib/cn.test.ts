import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn design typography", () => {
  it("keeps semantic font sizes alongside semantic text colors", () => {
    expect(cn("text-body text-fg")).toBe("text-body text-fg");
    expect(cn("text-fg-on-accent text-body")).toBe("text-fg-on-accent text-body");
    expect(cn("text-body-lg text-fg-secondary")).toBe("text-body-lg text-fg-secondary");
  });

  it("still lets a caller replace a semantic font size", () => {
    expect(cn("text-body", "text-small")).toBe("text-small");
  });
});
