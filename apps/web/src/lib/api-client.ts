"use client";

import { authClient } from "@/lib/auth-client";
import type { components } from "@/lib/generated/api";

export type Notebook = components["schemas"]["NotebookOut"];
export type NotebookCreate = components["schemas"]["NotebookCreate"];
export type NotebookUpdate = components["schemas"]["NotebookUpdate"];
export type UserSettings = components["schemas"]["SettingsOut"];
export type SettingsUpdate = components["schemas"]["SettingsUpdate"];
export type ModelOption = components["schemas"]["ModelOption"];
export type Connection = components["schemas"]["ConnectionOut"];
export type Provider = UserSettings["provider"];

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let pendingToken: Promise<string> | null = null;

function tokenExpiry(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split(".")[1])) as { exp?: number };
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

export async function getToken(force = false): Promise<string> {
  if (force) {
    cachedToken = null;
    tokenExpiresAt = 0;
  }
  if (cachedToken && Date.now() + 30_000 < tokenExpiresAt) return cachedToken;
  if (!pendingToken) {
    pendingToken = authClient.token().then((result) => {
      const token = result.data?.token;
      if (!token) throw new Error("Your session has expired. Please sign in again.");
      cachedToken = token;
      tokenExpiresAt = tokenExpiry(token);
      return token;
    }).finally(() => { pendingToken = null; });
  }
  return pendingToken;
}

export function clearApiToken() {
  cachedToken = null;
  tokenExpiresAt = 0;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken(attempt > 0);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(`${base}${path}`, { ...init, headers, cache: "no-store" });
    if (response.status === 401 && attempt === 0) continue;
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { message?: string; detail?: string };
      throw new Error(error.message ?? error.detail ?? `Request failed (${response.status})`);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  }
  throw new Error("Your session has expired. Please sign in again.");
}

export const notebookApi = {
  list: () => apiFetch<Notebook[]>("/notebooks"),
  get: (id: string) => apiFetch<Notebook>(`/notebooks/${encodeURIComponent(id)}`),
  create: (body: NotebookCreate) => apiFetch<Notebook>("/notebooks", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: NotebookUpdate) => apiFetch<Notebook>(`/notebooks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id: string) => apiFetch<void>(`/notebooks/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export const settingsApi = {
  get: () => apiFetch<UserSettings>("/settings"),
  update: (body: SettingsUpdate) => apiFetch<UserSettings>("/settings", { method: "PUT", body: JSON.stringify(body) }),
  models: (provider: Provider) => apiFetch<{ models: ModelOption[] }>(`/settings/models?provider=${provider}`),
  test: () => apiFetch<Connection>("/settings/test-connection", { method: "POST" }),
};

export type Source = components["schemas"]["SourceOut"];
export type SourceContent = components["schemas"]["SourceContentOut"];
export type ChatMessage = components["schemas"]["ChatMessageOut"];
export type ChatCitation = components["schemas"]["ChatCitation"];
export type Guide = components["schemas"]["GuideOut"];
export type Note = components["schemas"]["NoteOut"];
export type NoteIn = components["schemas"]["NoteIn"];
export type NotePatch = components["schemas"]["NotePatch"];
export type ChatFinal = {
  message_id: string;
  content: string;
  citations: ChatCitation[];
  followups: string[];
  model_name: string;
};

export const sourceApi = {
  list: (id: string) => apiFetch<Source[]>(`/notebooks/${encodeURIComponent(id)}/sources`),
  content: (id: string, sourceId: string) => apiFetch<SourceContent>(`/notebooks/${encodeURIComponent(id)}/sources/${encodeURIComponent(sourceId)}/content`),
  guide: (id: string, sourceId: string) => apiFetch<Guide>(`/notebooks/${encodeURIComponent(id)}/sources/${encodeURIComponent(sourceId)}/guide`),
  rename: (id: string, sourceId: string, name: string) => apiFetch<Source>(`/notebooks/${encodeURIComponent(id)}/sources/${encodeURIComponent(sourceId)}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  text: (id: string, name: string, text: string) => apiFetch<Source>(`/notebooks/${encodeURIComponent(id)}/sources/text`, { method: "POST", body: JSON.stringify({ name, text }) }),
  url: (id: string, url: string) => apiFetch<Source>(`/notebooks/${encodeURIComponent(id)}/sources/url`, { method: "POST", body: JSON.stringify({ url }) }),
  retry: (id: string, sourceId: string) => apiFetch<Source>(`/notebooks/${encodeURIComponent(id)}/sources/${encodeURIComponent(sourceId)}/retry`, { method: "POST" }),
  select: (id: string, sourceId: string, selected: boolean) => apiFetch<Source>(`/notebooks/${encodeURIComponent(id)}/sources/${encodeURIComponent(sourceId)}`, { method: "PATCH", body: JSON.stringify({ selected }) }),
  remove: (id: string, sourceId: string) => apiFetch<void>(`/notebooks/${encodeURIComponent(id)}/sources/${encodeURIComponent(sourceId)}`, { method: "DELETE" }),
  reindex: (id: string) => apiFetch<{ status: string }>(`/notebooks/${encodeURIComponent(id)}/reindex`, { method: "POST" }),
};

export const guideApi = {
  overview: (id: string) => apiFetch<Guide | null>(`/notebooks/${encodeURIComponent(id)}/overview`),
};

export const noteApi = {
  list: (id: string) => apiFetch<Note[]>(`/notebooks/${encodeURIComponent(id)}/notes`),
  create: (id: string, body: NoteIn) => apiFetch<Note>(`/notebooks/${encodeURIComponent(id)}/notes`, { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, noteId: string, body: NotePatch) => apiFetch<Note>(`/notebooks/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id: string, noteId: string) => apiFetch<void>(`/notebooks/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`, { method: "DELETE" }),
  saveChat: (id: string, messageId: string) => apiFetch<Note>(`/notebooks/${encodeURIComponent(id)}/notes/from-chat/${encodeURIComponent(messageId)}`, { method: "POST" }),
  convert: (id: string, noteId: string) => apiFetch<Source>(`/notebooks/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}/convert-to-source`, { method: "POST" }),
};

export const chatApi = {
  history: (id: string) => apiFetch<ChatMessage[]>(`/notebooks/${encodeURIComponent(id)}/chat`),
  clear: (id: string) => apiFetch<void>(`/notebooks/${encodeURIComponent(id)}/chat`, { method: "DELETE" }),
  async stream(
    notebookId: string,
    question: string,
    callbacks: { onToken: (token: string) => void; onFinal: (result: ChatFinal) => void },
    signal: AbortSignal,
  ): Promise<void> {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await getToken(attempt > 0);
      const response = await fetch(`${base}/notebooks/${encodeURIComponent(notebookId)}/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal,
        cache: "no-store",
      });
      if (response.status === 401 && attempt === 0) continue;
      if (!response.ok || !response.body) {
        const error = await response.json().catch(() => ({})) as { message?: string; detail?: string };
        throw new Error(error.message ?? error.detail ?? `Chat failed (${response.status})`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let completed = false;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          const frames = pending.split("\n\n");
          pending = frames.pop() ?? "";
          for (const frame of frames) {
            const event = frame.split("\n").find((line) => line.startsWith("event: "))?.slice(7);
            const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
            if (!data) continue;
            if (event === "token") callbacks.onToken((JSON.parse(data) as { text: string }).text);
            if (event === "final") { callbacks.onFinal(JSON.parse(data) as ChatFinal); completed = true; }
            if (event === "error") throw new Error((JSON.parse(data) as { message: string }).message);
          }
        }
      } finally {
        reader.releaseLock();
      }
      if (!completed && !signal.aborted) throw new Error("Chat stream ended before the answer completed");
      return;
    }
    throw new Error("Your session has expired. Please sign in again.");
  },
};

export async function uploadSource(notebookId: string, file: File, onProgress: (percentage: number) => void): Promise<Source> {
  const body = new FormData();
  body.append("file", file);
  const send = async (refresh: boolean): Promise<Source> => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/notebooks/${encodeURIComponent(notebookId)}/sources/upload`);
    void getToken(refresh).then((token) => {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.send(body);
    }).catch(reject);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText) as Source);
      else if (xhr.status === 401 && !refresh) void send(true).then(resolve, reject);
      else {
        let message = `Upload failed (${xhr.status})`;
        try { const error = JSON.parse(xhr.responseText) as { message?: string; detail?: string }; message = error.message ?? error.detail ?? message; } catch { /* response was not JSON */ }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("Upload could not reach the API"));
  });
  return send(false);
}
