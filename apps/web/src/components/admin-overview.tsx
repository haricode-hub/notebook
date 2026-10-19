"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

type AdminOverviewData = {
  generated_at: string;
  failed_jobs: {
    id: string;
    user_id: string;
    kind: string;
    status: string;
    stage: string | null;
    progress: number;
    error: string | null;
  }[];
  usage_24h: {
    user_id: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    reported_cost_usd: number | null;
  }[];
};

export function AdminOverview() {
  const overview = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => apiFetch<AdminOverviewData>("/admin/overview"),
  });
  if (overview.isLoading) return <p role="status">Loading operations data…</p>;
  if (overview.error) return <p role="alert">{overview.error.message}</p>;
  const data = overview.data;
  if (!data) return <p>No operations data available.</p>;

  return <div className="space-y-8">
    <section aria-labelledby="failed-jobs-heading" className="space-y-3">
      <h2 id="failed-jobs-heading" className="text-xl font-semibold">Failed jobs</h2>
      {data.failed_jobs.length === 0 ? <p>No failed jobs.</p> : <ul className="space-y-3">
        {data.failed_jobs.map((job) => <li key={job.id} className="rounded-lg border p-4">
          <p className="font-medium">{job.kind} · {job.stage ?? job.status}</p>
          <p className="text-sm text-slate-500">Job {job.id} · user {job.user_id}</p>
          <p className="mt-1 text-sm">{job.error ?? "No error details"}</p>
        </li>)}
      </ul>}
    </section>
    <section aria-labelledby="usage-heading" className="space-y-3">
      <h2 id="usage-heading" className="text-xl font-semibold">Chat usage, last 24 hours</h2>
      {data.usage_24h.length === 0 ? <p>No usage recorded.</p> : <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr><th scope="col">User</th><th scope="col">Requests</th><th scope="col">Input tokens</th><th scope="col">Output tokens</th><th scope="col">Reported cost</th></tr></thead>
          <tbody>{data.usage_24h.map((row) => <tr key={row.user_id} className="border-t">
            <td className="py-2">{row.user_id}</td><td>{row.requests}</td><td>{row.input_tokens}</td><td>{row.output_tokens}</td><td>{row.reported_cost_usd === null ? "Unavailable" : `$${row.reported_cost_usd.toFixed(4)}`}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </div>;
}
