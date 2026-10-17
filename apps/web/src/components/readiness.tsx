import type { Readiness } from "@/lib/api";

export function ReadinessView({ readiness }: { readiness: Readiness | null }) {
  const checks = [
    { label: "API", value: readiness?.status === "ok" ? "ok" : "down" },
    { label: "Database", value: readiness?.db ?? "down" },
    { label: "Redis", value: readiness?.redis ?? "down" },
    { label: "Embeddings", value: readiness?.embed ?? "down" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {checks.map(({ label, value }) => (
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm" key={label}>
          <p className="text-sm text-neutral-500">{label}</p>
          <p className={`mt-2 text-xl font-semibold ${value === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
            <span aria-label={`${label} ${value}`} className="mr-2 inline-block size-2.5 rounded-full bg-current" />
            {value === "ok" ? "Ready" : "Unavailable"}
          </p>
        </div>
      ))}
    </div>
  );
}
