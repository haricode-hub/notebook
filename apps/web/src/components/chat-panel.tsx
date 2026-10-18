"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Send, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { chatApi, sourceApi, type ChatCitation, type ChatMessage } from "@/lib/api-client";

const starterQuestions = [
  "What are the key ideas in my sources?",
  "What evidence do my sources provide?",
  "What should I study next?",
];

function CitationChip({ citation }: { citation: ChatCitation }) {
  const [open, setOpen] = useState(false);
  return <span className="group relative inline-block align-baseline">
    <button type="button" aria-label={`Source ${citation.n}: ${citation.source_name}`} onClick={() => setOpen(!open)} className="mx-0.5 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-200 dark:bg-indigo-900 dark:text-indigo-100">S{citation.n}</button>
    <span role="note" className={`${open ? "block" : "hidden group-hover:block group-focus-within:block"} absolute bottom-full left-0 z-30 mb-2 w-64 rounded-lg border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200`}>
      <strong className="block truncate">{citation.source_name}{citation.page_start ? ` · page ${citation.page_start}` : ""}</strong>
      <span className="mt-1 block max-h-32 overflow-y-auto">{citation.quote}</span>
    </span>
  </span>;
}

function Answer({ message }: { message: ChatMessage }) {
  const citations = new Map(message.citations.map((citation) => [citation.n, citation]));
  const markdown = message.content.replace(/\[S(\d+)\]/g, (marker, rawNumber: string) => citations.has(Number(rawNumber)) ? `[${marker}](cite:${rawNumber})` : marker);
  return <div className="space-y-2">
    <div className="space-y-2 break-words text-sm leading-relaxed [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_table]:block [&_table]:overflow-x-auto [&_ul]:ml-5 [&_ul]:list-disc">
      <Markdown remarkPlugins={[remarkGfm]} urlTransform={(url) => url.startsWith("cite:") ? url : defaultUrlTransform(url)} components={{ a: ({ href, children }) => {
        if (href?.startsWith("cite:")) {
          const citation = citations.get(Number(href.slice(5)));
          return citation ? <CitationChip citation={citation} /> : <>{children}</>;
        }
        return <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline dark:text-indigo-400">{children}</a>;
      } }}>{markdown}</Markdown>
    </div>
    <div className="flex items-center gap-2 text-xs text-slate-500">
      {message.model_name && <span className="rounded border px-1.5 py-0.5" aria-label={`Model ${message.model_name}`}>{message.model_name}</span>}
      {message.content && <button type="button" className="inline-flex items-center gap-1 hover:text-indigo-600" onClick={async () => { await navigator.clipboard.writeText(message.content); toast.success("Answer copied"); }}><Copy className="size-3" /> Copy</button>}
    </div>
  </div>;
}

export function ChatPanel({ notebookId }: { notebookId: string }) {
  const client = useQueryClient();
  const history = useQuery({ queryKey: ["chat", notebookId], queryFn: () => chatApi.history(notebookId), refetchOnWindowFocus: false });
  const sources = useQuery({ queryKey: ["sources", notebookId], queryFn: () => sourceApi.list(notebookId) });
  const [localMessages, setLocalMessages] = useState<ChatMessage[] | null>(null);
  const messages = useMemo(() => localMessages ?? history.data ?? [], [localMessages, history.data]);
  const setMessages = (update: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[])) => {
    setLocalMessages((current) => {
      const previous = current ?? history.data ?? [];
      return typeof update === "function" ? update(previous) : update;
    });
  };
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [followups, setFollowups] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const requestNumber = useRef(0);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => () => controller.current?.abort(), []);

  const send = async (value = question) => {
    const asked = value.trim();
    if (!asked || streaming) return;
    const abort = new AbortController();
    controller.current = abort;
    setStreaming(true);
    setQuestion("");
    setFollowups([]);
    requestNumber.current += 1;
    const stamp = requestNumber.current;
    const userId = `pending-user-${stamp}`;
    const answerId = `pending-answer-${stamp}`;
    setMessages((current) => [...current,
      { id: userId, role: "user", content: asked, citations: [], model_name: null, created_at: new Date().toISOString() },
      { id: answerId, role: "assistant", content: "", citations: [], model_name: null, created_at: new Date().toISOString() },
    ]);
    try {
      await chatApi.stream(notebookId, asked, {
        onToken: (token) => setMessages((current) => current.map((message) => message.id === answerId ? { ...message, content: message.content + token } : message)),
        onFinal: (result) => {
          setMessages((current) => current.map((message) => message.id === answerId ? { ...message, id: result.message_id, content: result.content, citations: result.citations, model_name: result.model_name } : message));
          setFollowups(result.followups);
        },
      }, abort.signal);
      await client.invalidateQueries({ queryKey: ["chat", notebookId] });
    } catch (error) {
      if (!abort.signal.aborted) toast.error(error instanceof Error ? error.message : "Chat failed");
      setMessages((current) => current.filter((message) => message.id !== answerId));
    } finally {
      controller.current = null;
      setStreaming(false);
    }
  };

  const clear = async () => {
    try { await chatApi.clear(notebookId); setMessages([]); setFollowups([]); await client.invalidateQueries({ queryKey: ["chat", notebookId] }); toast.success("Chat cleared"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not clear chat"); }
  };

  const readyCount = sources.data?.filter((source) => source.selected && source.status === "ready").length ?? 0;
  return <section className="flex h-full min-h-0 flex-col" aria-label="Chat">
    <div className="flex items-center justify-between border-b border-slate-200 p-3 dark:border-slate-800"><div><h2 className="font-semibold">Chat</h2><p className="text-xs text-slate-500">{readyCount} ready {readyCount === 1 ? "source" : "sources"} selected</p></div><Button size="sm" variant="ghost" aria-label="Clear chat" onClick={() => void clear()} disabled={messages.length === 0 || streaming}><Trash2 className="size-4" /></Button></div>
    <div className="min-h-0 flex-1 overflow-y-auto p-4" aria-live="polite">
      {history.isPending ? <div className="space-y-3" aria-label="Loading chat">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}</div> : messages.length === 0 ? <div className="flex h-full flex-col items-center justify-center gap-4 text-center"><div className="text-3xl">✧</div><p className="font-medium">Ask about your sources</p><p className="max-w-sm text-sm text-slate-500">Answers use only selected sources and show their citations.</p><div className="grid gap-2">{starterQuestions.map((item) => <Button key={item} size="sm" variant="outline" onClick={() => void send(item)}>{item}</Button>)}</div></div> : <div className="space-y-5">{messages.map((message) => <article key={message.id} className={message.role === "user" ? "ml-auto max-w-[90%] rounded-xl bg-indigo-50 p-3 text-sm dark:bg-indigo-950" : "max-w-full rounded-xl border border-slate-200 p-3 dark:border-slate-800"}>{message.role === "user" ? message.content : message.content ? <Answer message={message} /> : <p className="animate-pulse text-sm text-slate-500">Finding an answer…</p>}</article>)}<div ref={bottom} /></div>}
      {followups.length > 0 && !streaming && <div className="mt-4 flex flex-wrap gap-2">{followups.map((item) => <Button key={item} size="sm" variant="outline" onClick={() => void send(item)}>{item}</Button>)}</div>}
    </div>
    <form className="border-t border-slate-200 p-3 dark:border-slate-800" onSubmit={(event) => { event.preventDefault(); void send(); }}><label htmlFor="chat-question" className="sr-only">Ask your sources</label><textarea id="chat-question" aria-label="Ask your sources" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask your sources…" maxLength={4000} rows={2} className="w-full resize-none rounded-lg border border-slate-300 bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900" /><div className="mt-2 flex justify-end">{streaming ? <Button type="button" variant="outline" onClick={() => { controller.current?.abort(); setStreaming(false); }}><Square className="size-3" /> Stop</Button> : <Button type="submit" disabled={!question.trim()}><Send className="size-4" /> Send</Button>}</div></form>
  </section>;
}
