export type WorkspaceLayout = Record<"sources" | "chat" | "studio", number>;
export type WorkspaceDivider = "sources-chat" | "chat-studio";

const snapPoints = [15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const chatMin = 25;
const sourceMin = 14;
const studioMin = 22;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nearestSnap(value: number, min: number, max: number): number {
  const points = snapPoints.filter((point) => point >= min && point <= max);
  if (points.length === 0) return min;
  return points.reduce((nearest, point) => Math.abs(point - value) < Math.abs(nearest - value) ? point : nearest, points[0]);
}

/** Project a released divider by its pointer velocity, then settle on a 5% layout step. */
export function projectWorkspaceLayout(
  layout: WorkspaceLayout,
  divider: WorkspaceDivider,
  velocityX: number,
  groupWidth: number,
): WorkspaceLayout {
  if (groupWidth <= 0) return layout;

  const projectedPercent = clamp(velocityX, -2_000, 2_000) * 0.12 / groupWidth * 100;
  if (divider === "sources-chat") {
    const maximum = 100 - layout.studio - chatMin;
    const sourceCandidate = clamp(layout.sources + projectedPercent, sourceMin, maximum);
    const sources = nearestSnap(sourceCandidate, sourceMin, maximum);
    return { ...layout, sources, chat: 100 - sources - layout.studio };
  }

  const maximum = 100 - layout.sources - chatMin;
  const studioCandidate = clamp(layout.studio - projectedPercent, studioMin, maximum);
  const studio = nearestSnap(studioCandidate, studioMin, maximum);
  return { ...layout, studio, chat: 100 - layout.sources - studio };
}

export function rubberBandOffset(overrunPixels: number): number {
  const sign = Math.sign(overrunPixels);
  return sign * Math.min(8, Math.sqrt(Math.abs(overrunPixels)) * 1.5);
}
