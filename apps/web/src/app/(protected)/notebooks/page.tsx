"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notebookApi, type Notebook } from "@/lib/api-client";

export default function NotebooksPage() {
  const client = useQueryClient();
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const query = useQuery({ queryKey: ["notebooks"], queryFn: notebookApi.list });
  const refresh = () => client.invalidateQueries({ queryKey: ["notebooks"] });
  const create = useMutation({ mutationFn: notebookApi.create, onSuccess: () => { setTitle(""); refresh(); toast.success("Notebook created"); }, onError: (error) => toast.error(error.message) });
  const rename = useMutation({ mutationFn: ({ id, title }: { id: string; title: string }) => notebookApi.update(id, { title }), onSuccess: () => { setEditing(null); refresh(); toast.success("Notebook renamed"); }, onError: (error) => toast.error(error.message) });
  const remove = useMutation({ mutationFn: notebookApi.remove, onSuccess: () => { refresh(); toast.success("Notebook deleted"); }, onError: (error) => toast.error(error.message) });

  function confirmDelete(book: Notebook) {
    if (window.confirm(`Delete “${book.title}”? This cannot be undone.`)) remove.mutate(book.id);
  }

  return <main className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Your library</p><h1 className="mt-2 text-3xl font-semibold">Notebooks</h1><p className="mt-2 text-sm text-slate-500">A place for every research topic.</p></div>
    </div>
    <form className="mb-8 flex max-w-xl gap-2" onSubmit={(event) => { event.preventDefault(); if (title.trim()) create.mutate({ title: title.trim(), response_length: "medium" }); }}>
      <Input aria-label="New notebook title" placeholder="New notebook title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
      <Button type="submit" disabled={!title.trim() || create.isPending} className="bg-indigo-600 text-white hover:bg-indigo-700"><Plus /> Create</Button>
    </form>
    {query.isPending ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading notebooks">{[1, 2, 3].map((n) => <div key={n} className="h-40 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />)}</div> : query.isError ? <div role="alert" className="rounded-xl border p-6">Could not load notebooks. <Button variant="link" onClick={() => query.refetch()}>Try again</Button></div> : query.data?.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-20 text-center dark:border-slate-700"><BookOpen className="mx-auto mb-4 size-10 text-indigo-400" /><h2 className="text-xl font-semibold">Start your first notebook</h2><p className="mt-2 text-sm text-slate-500">Give it a name above to open a workspace.</p></div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{query.data?.map((book) => <article key={book.id} className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900">
      <BookOpen className="mb-7 size-6 text-indigo-600 dark:text-indigo-400" />
      {editing === book.id ? <form onSubmit={(event) => { event.preventDefault(); if (draft.trim()) rename.mutate({ id: book.id, title: draft.trim() }); }} className="flex gap-2"><Input aria-label="Rename notebook" value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus /><Button type="submit" size="sm" disabled={!draft.trim() || rename.isPending}>Save</Button></form> : <Link className="block text-lg font-semibold hover:text-indigo-600" href={`/workspace/${book.id}`}>{book.title}</Link>}
      <p className="mt-2 text-xs text-slate-500">Updated {new Date(book.updated_at).toLocaleDateString()}</p>
      <div className="mt-5 flex justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800"><Button variant="ghost" size="sm" onClick={() => { setEditing(book.id); setDraft(book.title); }}>Rename</Button><Button variant="ghost" size="sm" aria-label={`Delete ${book.title}`} onClick={() => confirmDelete(book)}><Trash2 /></Button></div>
    </article>)}</div>}
  </main>;
}
