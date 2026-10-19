"use client";

import { Material } from "@/components/ui/material";
import { Button } from "@/components/ui/button";
import { useMotionPrefs } from "@/design/use-motion-prefs";

const swatches = [
  ["Canvas", "bg-slate-50 dark:bg-slate-950"],
  ["Surface", "bg-white dark:bg-slate-900"],
  ["Accent", "bg-indigo-600"],
  ["Success", "bg-emerald-600"],
] as const;

export function DesignLabClient() {
  const preferences = useMotionPrefs();
  return <main className="mx-auto max-w-5xl space-y-8 p-6 sm:p-10">
    <header><p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Development only</p><h1 className="mt-2 text-3xl font-semibold">Design lab</h1><p className="mt-2 text-slate-600 dark:text-slate-300">Review the app tokens, material fallbacks, and active accessibility preferences.</p></header>
    <section aria-labelledby="lab-colors"><h2 id="lab-colors" className="mb-3 text-lg font-semibold">Color tokens</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{swatches.map(([name, color]) => <div key={name} className="rounded-xl border p-3"><div className={`mb-2 h-16 rounded-lg ${color}`} /><span className="text-sm">{name}</span></div>)}</div></section>
    <section aria-labelledby="lab-materials"><h2 id="lab-materials" className="mb-3 text-lg font-semibold">Materials</h2><div className="grid gap-3 sm:grid-cols-3">{(["thin", "regular", "thick"] as const).map((tone) => <Material key={tone} tone={tone} className="rounded-2xl border p-5"><p className="font-medium">{tone}</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Preference-aware surface sample</p></Material>)}</div></section>
    <section aria-labelledby="lab-interaction"><h2 id="lab-interaction" className="mb-3 text-lg font-semibold">Interaction and preferences</h2><div className="flex flex-wrap items-center gap-4 rounded-2xl border p-5"><Button>Press and focus</Button><dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm"><dt>Reduced motion</dt><dd>{String(preferences.reducedMotion)}</dd><dt>Reduced transparency</dt><dd>{String(preferences.reducedTransparency)}</dd><dt>More contrast</dt><dd>{String(preferences.moreContrast)}</dd></dl></div></section>
  </main>;
}
