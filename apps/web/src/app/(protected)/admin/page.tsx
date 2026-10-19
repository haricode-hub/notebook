import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AdminOverview } from "@/components/admin-overview";
import { auth } from "@/lib/auth";

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as { role?: string }).role !== "admin") notFound();
  return <main className="mx-auto max-w-6xl space-y-6 px-5 py-10">
    <div>
      <p className="text-sm font-semibold uppercase tracking-widest text-violet-600">Operations</p>
      <h1 className="mt-2 text-3xl font-bold">Admin dashboard</h1>
      <p className="mt-2 text-slate-500">Job failures and per-user chat usage for the last 24 hours.</p>
    </div>
    <AdminOverview />
  </main>;
}
