import { describe, expect, it } from "vitest";
import { getVisibleServices, serviceCapabilities, services } from "./services";

describe("platform service registry", () => {
  it("exposes Open Notebook as the only currently available visible service", () => {
    expect(getVisibleServices().map(({ id, status, route }) => ({ id, status, route }))).toEqual([
      { id: "open-notebook", status: "available", route: "/notebooks" },
    ]);
  });

  it("keeps a complete catalog contract for future entries", () => {
    for (const service of services) {
      expect(service.name).toBeTruthy();
      expect(service.description).toBeTruthy();
      expect(service.icon).toBeDefined();
      expect(service.route.startsWith("/")).toBe(true);
      expect(service.features.length).toBeGreaterThan(0);
      expect(service.cta).toBeTruthy();
      expect(["available", "coming-soon"]).toContain(service.status);
    }
    expect(serviceCapabilities).toHaveLength(4);
  });
});
