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
    <header><p className="text-overline uppercase text-accent">Shared read-only notebook</p><h1 className="mt-2 font-serif text-display font-medium">{notebook?.title ?? "This share link is unavailable"}</h1></header>
    {notebook ? <>
      <section aria-label="Shared sources" className="space-y-3"><h2 className="text-title-2 font-semibold">Sources</h2>{notebook.sources.map((source) => <article key={source.id} className="rounded-lg border p-4"><h3 className="font-semibold">{source.name}</h3><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-body leading-6">{source.text}</pre></article>)}</section>
      {notebook.notes.length > 0 && <section aria-label="Shared notes" className="space-y-3"><h2 className="text-title-2 font-semibold">Notes</h2>{notebook.notes.map((note, index) => <article key={`${note.title}-${index}`} className="rounded-lg border p-4"><h3 className="font-semibold">{note.title}</h3><div className="markdown-body mt-3 max-w-none"><SharedMarkdown content={note.content_markdown} /></div></article>)}</section>}
      {notebook.artifacts.length > 0 && <section aria-label="Shared artifacts" className="space-y-3"><h2 className="text-title-2 font-semibold">Studio artifacts</h2>{notebook.artifacts.map((artifact, index) => <article key={`${artifact.recipe}-${index}`} className="rounded-lg border p-4"><h3 className="font-semibold capitalize">{artifact.recipe.replaceAll("_", " ")}</h3><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-body">{JSON.stringify(artifact.output, null, 2)}</pre></article>)}</section>}
    </> : <p role="alert" className="rounded-lg border border-warning bg-warning-soft p-4">This link has expired or was revoked.</p>}
  </main>;
}
