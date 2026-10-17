import { ReadinessView } from "@/components/readiness";
import { Button } from "@/components/ui/button";
import { getReadiness } from "@/lib/api";

export default async function Home() {
  const readiness = await getReadiness().catch(() => null);
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-16">
      <div className="mb-12">
        <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">OpenNotebook Studio</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Workspace foundation</h1>
        <p className="mt-4 max-w-2xl text-neutral-600">The research workspace is starting up. Service readiness appears below.</p>
        <Button asChild className="mt-6 bg-indigo-600 text-white hover:bg-indigo-700">
          <Link href="/">Refresh status</Link>
        </Button>
      </div>
      <ReadinessView readiness={readiness} />
    </main>
  );
}
import Link from "next/link";

