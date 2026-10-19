"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { artifactApi, type ChatCitation } from "@/lib/api-client";
import { springOptions } from "@/design/springs";
import { useMotionPrefs } from "@/design/use-motion-prefs";

type Card = { front: string; back: string; source_ref: number };
type Progress = { card_index: number; box: number; due_at: string; last_result: string | null };
function csvCell(value: string) { return `"${value.replaceAll('"', '""')}"`; }

export default function FlashcardsView({ notebookId, artifactId, cards, citations }: {
  notebookId: string; artifactId: string; cards: Card[]; citations: ChatCitation[];
}) {
  const [order, setOrder] = useState<number[]>(cards.map((_, index) => index));
  const [active, setActive] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [progress, setProgress] = useState<Progress[]>([]);
  const { reducedMotion } = useMotionPrefs();
  useEffect(() => { void artifactApi.flashcardProgress(notebookId, artifactId).then(setProgress); }, [notebookId, artifactId]);
  const currentIndex = order[active] ?? 0;
  const card = cards[currentIndex];
  const dueIndices = useMemo(() => new Set(cards.map((_, index) => index).filter((index) => {
    const item = progress.find((record) => record.card_index === index);
    return !item || new Date(item.due_at) <= new Date();
  })), [cards, progress]);
  const rate = async (known: boolean) => {
    const result = await artifactApi.reviewFlashcard(notebookId, artifactId, currentIndex, known);
    setProgress((old) => [...old.filter((item) => item.card_index !== currentIndex), result]);
    setFlipped(false); setActive((index) => (index + 1) % cards.length);
  };
  const shuffle = () => {
    setOrder((old) => {
      const next = [...old];
      for (let index = next.length - 1; index > 0; index -= 1) {
        const other = Math.floor(Math.random() * (index + 1));
        [next[index], next[other]] = [next[other], next[index]];
      }
      return next;
    });
    setActive(0); setFlipped(false);
  };
  const exportCsv = () => {
    const data = cards.map((item) => `${csvCell(item.front)},${csvCell(`${item.back} [S${item.source_ref}]`)}`).join("\n");
    const url = URL.createObjectURL(new Blob([`Front,Back\n${data}\n`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "flashcards-anki.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!card) return null;
  const citation = citations.find((item) => item.n === card.source_ref);
  const box = progress.find((item) => item.card_index === currentIndex)?.box ?? 1;
  return <section aria-label="Flashcards" className="space-y-3">
    <div className="flex items-center justify-between text-sm"><span>Card {active + 1} of {cards.length} · Leitner box {box}</span><span>{dueIndices.size} due</span></div>
    <motion.button type="button" aria-label={`Flip flashcard, showing ${flipped ? "answer" : "question"}`} aria-pressed={flipped} onClick={() => setFlipped((value) => !value)} whileTap={reducedMotion ? undefined : { scale: 0.985 }} animate={{ rotateY: flipped ? 180 : 0 }} transition={reducedMotion ? { duration: 0 } : springOptions("default")} style={{ transformStyle: "preserve-3d", perspective: 900 }} className="relative flex min-h-48 w-full items-center justify-center rounded-xl border bg-indigo-50 p-6 text-center text-lg dark:bg-indigo-950">
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center p-6 [backface-visibility:hidden]">{card.front}</span>
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center p-6 [transform:rotateY(180deg)] [backface-visibility:hidden]">{card.back}</span>
    </motion.button>
    {flipped && citation && <span className="text-xs text-indigo-700">[S{citation.n}] {citation.source_name}</span>}
    <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => void rate(true)}>Known</Button><Button size="sm" variant="outline" onClick={() => void rate(false)}>Unknown</Button><Button size="sm" variant="outline" onClick={shuffle}>Shuffle</Button><Button size="sm" variant="outline" onClick={exportCsv}>Export Anki CSV</Button></div>
  </section>;
}
