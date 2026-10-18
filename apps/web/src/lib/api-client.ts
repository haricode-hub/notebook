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

async function getToken(force = false): Promise<string> {
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
