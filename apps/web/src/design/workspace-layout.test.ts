import { describe, expect, it } from "vitest";

import { projectWorkspaceLayout, rubberBandOffset } from "./workspace-layout";

describe("workspace divider release", () => {
  it("projects pointer momentum to the nearest source snap point", () => {
    expect(projectWorkspaceLayout({ sources: 25, chat: 50, studio: 25 }, "sources-chat", 300, 1000))
      .toEqual({ sources: 30, chat: 45, studio: 25 });
  });

  it("projects the opposite direction for the chat and studio divider", () => {
    expect(projectWorkspaceLayout({ sources: 25, chat: 50, studio: 25 }, "chat-studio", 300, 1000))
      .toEqual({ sources: 25, chat: 50, studio: 25 });
  });

  it("keeps both neighbors above their minimum sizes at the outer bound", () => {
    const layout = projectWorkspaceLayout({ sources: 53, chat: 25, studio: 22 }, "sources-chat", 2000, 1000);
    expect(layout).toEqual({ sources: 50, chat: 28, studio: 22 });
  });

  it("rubber-bands outside the edge and caps the visible travel", () => {
    expect(rubberBandOffset(-16)).toBeLessThan(0);
    expect(rubberBandOffset(100_000)).toBe(8);
    expect(rubberBandOffset(-100_000)).toBe(-8);
  });
});
