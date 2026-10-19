import { SharedMarkdown } from "@/components/shared-markdown";

type Props = { params: Promise<{ token: string }> };
type SharedNotebook = {
  title: string;
  sources: { id: string; name: string; kind: string; text: string }[];
  notes: { title: string; content_markdown: string; citations: unknown[] }[];
  artifacts: { recipe: string; output: unknown; citations: unknown[] }[];
};

export const dynamic = "force-dynamic";

export default async function SharedNotebookPage({ params }: Props) {
  const { token } = await params;
  const response = await fetch(
    `${process.env.API_URL ?? "http://localhost:8000"}/public/shares/${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
  const notebook = response.ok ? await response.json() as SharedNotebook : null;
  return <main className="mx-auto min-h-screen max-w-4xl space-y-6 p-5 sm:p-10">
    <header><p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Shared read-only notebook</p><h1 className="mt-2 text-3xl font-bold">{notebook?.title ?? "This share link is unavailable"}</h1></header>
    {notebook ? <>
      <section aria-label="Shared sources" className="space-y-3"><h2 className="text-xl font-semibold">Sources</h2>{notebook.sources.map((source) => <article key={source.id} className="rounded-xl border p-4"><h3 className="font-semibold">{source.name}</h3><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-sm leading-6">{source.text}</pre></article>)}</section>
      {notebook.notes.length > 0 && <section aria-label="Shared notes" className="space-y-3"><h2 className="text-xl font-semibold">Notes</h2>{notebook.notes.map((note, index) => <article key={`${note.title}-${index}`} className="rounded-xl border p-4"><h3 className="font-semibold">{note.title}</h3><div className="prose prose-sm mt-3 max-w-none dark:prose-invert"><SharedMarkdown content={note.content_markdown} /></div></article>)}</section>}
      {notebook.artifacts.length > 0 && <section aria-label="Shared artifacts" className="space-y-3"><h2 className="text-xl font-semibold">Studio artifacts</h2>{notebook.artifacts.map((artifact, index) => <article key={`${artifact.recipe}-${index}`} className="rounded-xl border p-4"><h3 className="font-semibold capitalize">{artifact.recipe.replaceAll("_", " ")}</h3><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-sm">{JSON.stringify(artifact.output, null, 2)}</pre></article>)}</section>}
    </> : <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4">This link has expired or was revoked.</p>}
  </main>;
}
