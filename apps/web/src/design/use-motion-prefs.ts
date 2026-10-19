"use client";

import { useEffect, useState } from "react";

export interface MotionPrefs {
  reducedMotion: boolean;
  reducedTransparency: boolean;
  moreContrast: boolean;
}

const queries = {
  reducedMotion: "(prefers-reduced-motion: reduce)",
  reducedTransparency: "(prefers-reduced-transparency: reduce)",
  moreContrast: "(prefers-contrast: more)",
} as const;

const defaults: MotionPrefs = { reducedMotion: false, reducedTransparency: false, moreContrast: false };

export function useMotionPrefs(): MotionPrefs {
  const [prefs, setPrefs] = useState(defaults);
  useEffect(() => {
    const media = Object.fromEntries(Object.entries(queries).map(([key, query]) => [key, window.matchMedia(query)])) as Record<keyof MotionPrefs, MediaQueryList>;
    const sync = () => setPrefs({
      reducedMotion: media.reducedMotion.matches,
      reducedTransparency: media.reducedTransparency.matches,
      moreContrast: media.moreContrast.matches,
    });
    sync();
    for (const query of Object.values(media)) query.addEventListener("change", sync);
    return () => { for (const query of Object.values(media)) query.removeEventListener("change", sync); };
  }, []);
  return prefs;
}
