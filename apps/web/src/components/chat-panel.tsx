"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Save, Send, Sparkles, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CitedMarkdown } from "@/components/cited-markdown";
import { Button } from "@/components/ui/button";
import { Material } from "@/components/ui/material";
import { useMotionPrefs } from "@/design/use-motion-prefs";
import { chatApi, noteApi, sourceApi, type ChatCitation, type ChatMessage } from "@/lib/api-client";

const starterQuestions = [
  "What are the key ideas in my sources?",
  "What evidence do my sources provide?",
  "What should I study next?",
];

function Answer({ message, onOpenCitation, onSave }: { message: ChatMessage; onOpenCitation: (citation: ChatCitation, citations: ChatCitation[]) => void; onSave: () => void }) {
  return <div className="space-y-2">
    <CitedMarkdown content={message.content} citations={message.citations} onOpenCitation={onOpenCitation} />
    <div className="flex items-center gap-2 text-xs text-slate-500">
      {message.model_name && <span className="rounded border px-1.5 py-0.5" aria-label={`Model ${message.model_name}`}>{message.model_name}</span>}
      {message.content && <button type="button" className="inline-flex items-center gap-1 hover:text-indigo-600" onClick={async () => { await navigator.clipboard.writeText(message.content); toast.success("Answer copied"); }}><Copy className="size-3" /> Copy</button>}
      {!message.id.startsWith("pending-") && <button type="button" className="inline-flex items-center gap-1 hover:text-indigo-600" onClick={onSave}><Save className="size-3" /> Save to note</button>}
    </div>
  </div>;
}
export function ChatPanel({ notebookId, onOpenCitation, suggestedQuestion, onQuestionConsumed }: { notebookId: string; onOpenCitation: (citation: ChatCitation, citations: ChatCitation[]) => void; suggestedQuestion?: { id: number; text: string } | null; onQuestionConsumed?: () => void }) {
  const client = useQueryClient();
  const history = useQuery({ queryKey: ["chat", notebookId], queryFn: () => chatApi.history(notebookId), refetchOnWindowFocus: false });
  const sources = useQuery({ queryKey: ["sources", notebookId], queryFn: () => sourceApi.list(notebookId) });
  const [localMessages, setLocalMessages] = useState<ChatMessage[] | null>(null);
  const messages = useMemo(() => localMessages ?? history.data ?? [], [localMessages, history.data]);
  const setMessages = useCallback((update: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[])) => {
    setLocalMessages((current) => {
      const previous = current ?? history.data ?? [];
      return typeof update === "function" ? update(previous) : update;
    });
  }, [history.data]);
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [followups, setFollowups] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  const scrollPanel = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const followTail = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const { reducedMotion } = useMotionPrefs();
  const requestNumber = useRef(0);
  const seenQuestion = useRef(0);
  useEffect(() => {
    const viewport = scrollPanel.current;
    if (!viewport) return;
    if (followTail.current) viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
  }, [messages]);
  useEffect(() => {
    const input = composer.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
  }, [question]);
  useEffect(() => () => controller.current?.abort(), []);

  const send = useCallback(async (value = question) => {
    const asked = value.trim();
    if (!asked || streaming) return;
    const abort = new AbortController();
    controller.current = abort;
    setStreaming(true);
    setQuestion("");
    setFollowups([]);
    setShowJumpToLatest(!followTail.current);
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
  }, [client, notebookId, question, setMessages, streaming]);

  useEffect(() => {
    if (suggestedQuestion && suggestedQuestion.id !== seenQuestion.current) {
      seenQuestion.current = suggestedQuestion.id;
      onQuestionConsumed?.();
      void send(suggestedQuestion.text);
    }
  }, [suggestedQuestion, onQuestionConsumed, send]);

  const saveAnswer = async (message: ChatMessage) => {
    try { await noteApi.saveChat(notebookId, message.id); await client.invalidateQueries({ queryKey: ["notes", notebookId] }); toast.success("Answer saved to notes"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not save answer"); }
  };

  const clear = async () => {
    try { await chatApi.clear(notebookId); setMessages([]); setFollowups([]); await client.invalidateQueries({ queryKey: ["chat", notebookId] }); toast.success("Chat cleared"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not clear chat"); }
  };

  const readyCount = sources.data?.filter((source) => source.selected && source.status === "ready").length ?? 0;
  const jumpToLatest = () => {
    followTail.current = true;
    setShowJumpToLatest(false);
    const viewport = scrollPanel.current;
    if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
  };

  return <section className="flex h-full min-h-0 flex-col" aria-label="Chat">
    <div
      ref={scrollPanel}
      className="scroll-chrome relative min-h-0 flex-1 overflow-y-auto"
      onScroll={(event) => {
        const viewport = event.currentTarget;
        const nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80;
        followTail.current = nearBottom;
        if (nearBottom) setShowJumpToLatest(false);
        else if (streaming) setShowJumpToLatest(true);
      }}
    >
      <div className="flex min-h-full flex-col">
        <Material tone="thin" className="sticky top-0 z-20 flex items-center justify-between rounded-b-xl border-b border-slate-200/60 px-4 py-2 dark:border-slate-700/60">
          <div><h2 className="font-semibold">Chat</h2><p className="text-xs text-slate-600 dark:text-slate-300">{readyCount} ready {readyCount === 1 ? "source" : "sources"} selected</p></div>
          <Button size="sm" variant="ghost" aria-label="Clear chat" onClick={() => void clear()} disabled={messages.length === 0 || streaming}><Trash2 className="size-4" /></Button>
        </Material>
        <div className="flex-1 p-4" aria-live="polite">
          {history.isPending ? <div className="space-y-3" aria-label="Loading chat">{[1, 2, 3].map((item) => <div key={item} className="h-16 rounded-lg bg-slate-100 dark:bg-slate-800" />)}</div> : messages.length === 0 ? <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center"><Sparkles className="size-7 text-indigo-500" aria-hidden="true" /><p className="font-medium">Ask about your sources</p><p className="max-w-sm text-sm text-slate-600 dark:text-slate-300">Answers use only selected sources and show their citations.</p><div className="grid gap-2">{starterQuestions.map((item) => <Button key={item} size="sm" variant="outline" onClick={() => void send(item)}>{item}</Button>)}</div></div> : <div className="space-y-5">{messages.map((message) => <article key={message.id} className={message.role === "user" ? "ml-auto max-w-[90%] rounded-xl bg-indigo-50 p-3 text-sm dark:bg-indigo-950" : "max-w-full rounded-xl border border-slate-200 p-3 dark:border-slate-800"}>{message.role === "user" ? message.content : message.content ? <Answer message={message} onOpenCitation={onOpenCitation} onSave={() => void saveAnswer(message)} /> : <p className="min-h-10 text-sm text-slate-600 dark:text-slate-300">Finding an answer...</p>}</article>)}</div>}
          {followups.length > 0 && !streaming && <div className="followup-fade mt-4 flex gap-2 overflow-x-auto py-1">{followups.map((item) => <Button key={item} size="sm" variant="outline" className="shrink-0" onClick={() => void send(item)}>{item}</Button>)}</div>}
        </div>
        {showJumpToLatest && <div className="sticky bottom-20 z-10 flex justify-center"><Button size="sm" variant="secondary" onClick={jumpToLatest}>Jump to latest</Button></div>}
        <Material tone="regular" className="sticky bottom-0 z-20 rounded-t-xl border-t border-slate-200/60 p-3 dark:border-slate-700/60">
          <form onSubmit={(event) => { event.preventDefault(); void send(); }}>
            <label htmlFor="chat-question" className="sr-only">Ask your sources</label>
            <textarea ref={composer} id="chat-question" aria-label="Ask your sources" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask your sources..." maxLength={4000} rows={1} className="min-h-11 max-h-44 w-full resize-none overflow-y-auto rounded-lg border border-slate-300 bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900" />
            <div className="mt-2 flex justify-end">{streaming ? <Button type="button" variant="outline" onClick={() => { controller.current?.abort(); setStreaming(false); }}><Square className="size-3" /> Stop</Button> : <Button type="submit" disabled={!question.trim()}><Send className="size-4" /> Send</Button>}</div>
          </form>
        </Material>
      </div>
    </div>
  </section>;
}
