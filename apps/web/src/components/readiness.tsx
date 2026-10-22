import type { Readiness } from "@/lib/api";

export function ReadinessView({ readiness }: { readiness: Readiness | null }) {
  const checks = [
    { label: "API", value: readiness?.status === "ok" ? "ok" : "down" },
    { label: "Database", value: readiness?.db ?? "down" },
    { label: "Redis", value: readiness?.redis ?? "down" },
    { label: "Embeddings", value: readiness?.embed ?? "down" },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      {checks.map(({ label, value }) => (
        <div className="border-l border-border-subtle pl-3" key={label}>
          <p className="text-caption text-fg-secondary">{label}</p>
          <p className="mt-1 inline-flex items-center gap-2 text-body font-medium">
            <span aria-label={`${label} ${value}`} className={`inline-block size-1.5 rounded-full ${value === "ok" ? "bg-success" : "bg-danger"}`} />
            {value === "ok" ? "Ready" : "Unavailable"}
          </p>
        </div>
      ))}
    </div>
  );
}
