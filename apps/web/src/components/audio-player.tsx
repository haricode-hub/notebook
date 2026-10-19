"use client";

import { Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatCitation } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { audioApi } from "@/lib/api-client";

export type AudioTranscriptLine = {
  speaker: "Maya" | "Alex";
  text: string;
  citation_refs: number[];
  start: number;
  end: number;
};

export function AudioPlayer({ notebookId, artifactId, transcript, citations, onOpenCitation }: {
  notebookId: string;
  artifactId: string;
  transcript: AudioTranscriptLine[];
  citations: ChatCitation[];
  onOpenCitation: (citation: ChatCitation, citations: ChatCitation[]) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const citationMap = useMemo(() => new Map(citations.map((citation) => [citation.n, citation])), [citations]);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void audioApi.download(notebookId, artifactId).then((blob) => {
      objectUrl = URL.createObjectURL(blob);
      if (active) setUrl(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load audio"); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [notebookId, artifactId]);
  const activeLine = transcript.findIndex((line) => current >= line.start && current < line.end);
  const download = () => {
    if (!url) return;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "audio-overview.mp3";
    anchor.click();
  };
  return <section className="space-y-3" aria-label="Audio overview player">
    {url ? <audio ref={audioRef} aria-label="Audio overview" controls src={url} className="w-full" onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)} /> : <p className="text-sm text-slate-500">{error || "Loading audio…"}</p>}
    <div className="flex items-center gap-2">
      <label className="text-sm">Speed <select aria-label="Playback speed" className="rounded border p-1 dark:bg-slate-900" value={rate} onChange={(event) => { const next = Number(event.target.value); setRate(next); if (audioRef.current) audioRef.current.playbackRate = next; }}><option value={0.75}>0.75×</option><option value={1}>1×</option><option value={1.25}>1.25×</option><option value={1.5}>1.5×</option><option value={2}>2×</option></select></label>
      <Button size="sm" variant="outline" disabled={!url} onClick={download}><Download className="size-3" /> Download MP3</Button>
    </div>
    <div role="region" className="max-h-[55vh] space-y-2 overflow-y-auto" aria-label="Synced transcript">
      {transcript.map((line, index) => <div key={`${line.start}-${index}`} className={`rounded-lg border p-2 ${index === activeLine ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40" : "border-slate-200 dark:border-slate-800"}`}>
        <button type="button" className="text-left text-sm" aria-label={`Seek to ${line.speaker} at ${Math.floor(line.start)} seconds`} onClick={() => { const audio = audioRef.current; if (audio) { audio.currentTime = line.start; setCurrent(line.start); void audio.play(); } }}><span className="mr-2 font-semibold">{line.speaker}</span><span className="mr-2 text-xs text-slate-500">{Math.floor(line.start / 60)}:{String(Math.floor(line.start % 60)).padStart(2, "0")}</span>{line.text}</button>
        <div className="mt-1 flex gap-1">{line.citation_refs.map((ref) => { const citation = citationMap.get(ref); return citation ? <button type="button" key={ref} className="rounded border px-1.5 text-xs text-indigo-700 dark:text-indigo-300" onClick={() => onOpenCitation(citation, citations)}>[S{ref}]</button> : null; })}</div>
      </div>)}
    </div>
  </section>;
}
