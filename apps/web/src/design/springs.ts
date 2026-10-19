export type SpringToken = "default" | "momentum" | "sheet" | "move";

export interface MotionSpringOptions {
  type: "spring";
  duration: number;
  bounce: number;
}

// Motion maps its duration/bounce form to response/damping. Keep the default
// critically damped; only turn on bounce for a release that carries momentum.
const tokens: Record<SpringToken, Omit<MotionSpringOptions, "type" | "bounce">> = {
  default: { duration: 0.35 },
  momentum: { duration: 0.4 },
  sheet: { duration: 0.3 },
  move: { duration: 0.4 },
};

export function springOptions(token: SpringToken, carriesMomentum = false): MotionSpringOptions {
  return { type: "spring", ...tokens[token], bounce: carriesMomentum ? 0.2 : 0 };
}

export const spatialTransition = {
  drawer: { enter: { x: 24, opacity: 0 }, exit: { x: 24, opacity: 0 } },
  sheet: { enter: { y: 24, opacity: 0 }, exit: { y: 24, opacity: 0 } },
  toast: { enter: { y: 12, opacity: 0 }, exit: { y: 12, opacity: 0 } },
} as const;
