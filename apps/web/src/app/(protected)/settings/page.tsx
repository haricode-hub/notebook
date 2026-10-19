"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { settingsApi, type ModelOption, type Provider, type UserSettings } from "@/lib/api-client";
import { AccountSecurity } from "@/components/account-security";

const providers: { id: Provider; label: string }[] = [
  { id: "openrouter", label: "OpenRouter" }, { id: "gemini", label: "Gemini" },
  { id: "openai", label: "OpenAI" }, { id: "anthropic", label: "Anthropic" }, { id: "ollama", label: "Ollama" },
];

function ModelPicker({ label, value, models, onChange }: { label: string; value: string; models: ModelOption[]; onChange: (value: string) => void }) {
  const [search, setSearch] = useState("");
  const filtered = models.filter((model) => `${model.name} ${model.id}`.toLowerCase().includes(search.toLowerCase())).slice(0, 100);
  return <div className="space-y-2"><Label>{label}</Label><Input aria-label={`Search ${label.toLowerCase()}`} placeholder="Search models" value={search} onChange={(event) => setSearch(event.target.value)} />
    <select aria-label={label} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select a model</option>{value && !filtered.some((model) => model.id === value) && <option value={value}>{value}</option>}
      {filtered.map((model) => <option value={model.id} key={model.id}>{model.name} ({model.id})</option>)}
    </select></div>;
}

function SettingsForm({ initial }: { initial: UserSettings }) {
  const client = useQueryClient();
  const [provider, setProvider] = useState<Provider>(initial.provider);
  const [chatModel, setChatModel] = useState(initial.chat_model);
  const [cheapModel, setCheapModel] = useState(initial.cheap_model);
  const [fallbackModel, setFallbackModel] = useState(initial.fallback_model);
  const [apiKey, setApiKey] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState(initial.ollama_base_url);
  const models = useQuery({ queryKey: ["models", provider], queryFn: () => settingsApi.models(provider) });
  const save = useMutation({ mutationFn: () => settingsApi.update({ provider, chat_model: chatModel, cheap_model: cheapModel, fallback_model: fallbackModel, ...(apiKey ? { api_key: apiKey } : {}), ollama_base_url: ollamaUrl }), onSuccess: () => { setApiKey(""); client.invalidateQueries({ queryKey: ["settings"] }); toast.success("Settings saved"); }, onError: (error) => toast.error(error.message) });
  const test = useMutation({ mutationFn: async () => { await settingsApi.update({ provider, chat_model: chatModel, cheap_model: cheapModel, fallback_model: fallbackModel, ...(apiKey ? { api_key: apiKey } : {}), ollama_base_url: ollamaUrl }); setApiKey(""); client.invalidateQueries({ queryKey: ["settings"] }); return settingsApi.test(); }, onSuccess: (result) => toast.success(result.message), onError: (error) => toast.error(error.message) });
  return <div className="space-y-7">
    <div className="space-y-2"><Label htmlFor="provider">LLM provider</Label><select id="provider" className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800" value={provider} onChange={(event) => { setProvider(event.target.value as Provider); setChatModel(""); setCheapModel(""); setFallbackModel(""); setApiKey(""); }}>{providers.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></div>
    {provider === "ollama" ? <div className="space-y-2"><Label htmlFor="ollama-url">Ollama URL</Label><Input id="ollama-url" value={ollamaUrl} onChange={(event) => setOllamaUrl(event.target.value)} /></div> : <div className="space-y-2"><Label htmlFor="api-key">API key</Label><Input id="api-key" type="password" autoComplete="off" placeholder={initial.provider === provider && initial.has_api_key ? "Saved key (leave blank to keep)" : "Paste a key for this provider"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} /><p className="text-xs text-slate-500">{provider === "openrouter" && initial.using_server_key ? "A server OpenRouter key is available." : "Keys are encrypted before storage."}</p></div>}
    <div aria-live="polite" className="text-xs text-slate-500">{models.isPending ? "Loading models..." : models.isError ? "Could not load models. Check the provider key and try again." : `${models.data?.models.length ?? 0} models available`}</div>
    <div className="grid gap-5 sm:grid-cols-2"><ModelPicker key={`chat-${provider}`} label="Chat model" value={chatModel} models={models.data?.models ?? []} onChange={setChatModel} /><ModelPicker key={`cheap-${provider}`} label="Cheap model" value={cheapModel} models={models.data?.models ?? []} onChange={setCheapModel} /></div>
    <ModelPicker key={`fallback-${provider}`} label="Fallback model" value={fallbackModel} models={models.data?.models ?? []} onChange={setFallbackModel} />
    <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-5 dark:border-slate-800"><Button onClick={() => save.mutate()} disabled={save.isPending}>Save settings</Button><Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending || !chatModel}>{test.isPending ? "Testing..." : "Test connection"}</Button></div>
  </div>;
}

export default function SettingsPage() {
  const query = useQuery({ queryKey: ["settings"], queryFn: settingsApi.get });
  return <main className="mx-auto max-w-3xl px-5 py-10"><p className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Account</p><h1 className="mt-2 text-3xl font-semibold">Model settings</h1><p className="mb-8 mt-2 text-sm text-slate-500">Choose where chat runs. Model choices load from each provider.</p>
    {query.isPending ? <div className="h-96 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" aria-label="Loading settings" /> : query.isError ? <p role="alert">Could not load settings. <Button variant="link" onClick={() => query.refetch()}>Try again</Button></p> : <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"><SettingsForm initial={query.data} /></div>}
    <AccountSecurity />
  </main>;
}
