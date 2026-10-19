import { describe, expect, it } from "vitest";
import { designTokens } from "./tokens";
import { springOptions, spatialTransition } from "./springs";

describe("design tokens", () => {
  it("uses size-specific system typography tracking", () => {
    expect(parseFloat(designTokens.type.displayTracking)).toBeLessThan(0);
    expect(parseFloat(designTokens.type.bodyTracking)).toBe(0);
    expect(parseFloat(designTokens.type.smallTracking)).toBeGreaterThan(0);
  });

  it("keeps default springs damped and drawer transitions on a shared path", () => {
    expect(springOptions("default").bounce).toBe(0);
    expect(springOptions("default").duration).toBe(0.35);
    expect(springOptions("sheet").duration).toBe(0.3);
    expect(springOptions("momentum", true).bounce).toBeGreaterThan(0);
    expect(spatialTransition.drawer.enter.x).toBe(spatialTransition.drawer.exit.x);
  });
});
