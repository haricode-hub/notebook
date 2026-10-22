"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { artifactApi, type ChatCitation } from "@/lib/api-client";

type Question = { question: string; options: string[]; answer_index: number; explanation: string; source_ref: number };
type Attempt = { id: string; score: number; total: number; answers: number[]; wrong_indices: number[]; created_at: string };
export default function QuizView({ notebookId, artifactId, questions, citations, onOpenCitation }: {
  notebookId: string; artifactId: string; questions: Question[]; citations: ChatCitation[];
  onOpenCitation: (citation: ChatCitation, citations: ChatCitation[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>(Array(questions.length).fill(-1));
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [reviewWrong, setReviewWrong] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  useEffect(() => { void artifactApi.quizAttempts(notebookId, artifactId).then(setAttempts); }, [notebookId, artifactId]);
  const question = questions[index];
  const citationFor = (item: Question) => citations.find((citation) => citation.n === item.source_ref);
  const submit = async () => {
    const result = await artifactApi.submitQuiz(notebookId, artifactId, answers);
    setAttempt(result); setAttempts((old) => [result, ...old]);
  };
  const restart = () => { setIndex(0); setAnswers(Array(questions.length).fill(-1)); setAttempt(null); setReviewWrong(false); };
  if (reviewWrong && attempt) {
    const wrong = attempt.wrong_indices[reviewIndex];
    const item = questions[wrong];
    if (!item) return <section aria-label="Wrong answer review"><p>No incorrect answers. Great work.</p><Button onClick={restart}>Try again</Button></section>;
    const citation = citationFor(item);
    return <section aria-label="Wrong answer review" className="space-y-3"><h3 className="font-semibold">Review {reviewIndex + 1} of {attempt.wrong_indices.length}</h3><p>{item.question}</p><p className="text-body text-danger">Your answer: {item.options[attempt.answers[wrong]]}</p><p className="text-body text-success">Correct: {item.options[item.answer_index]}</p><p className="text-body">{item.explanation}</p>{citation && <button type="button" onClick={() => onOpenCitation(citation, citations)} className="text-caption text-accent underline">Open [S{citation.n}] {citation.source_name}</button>}<div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setReviewIndex((value) => Math.max(0, value - 1))} disabled={reviewIndex === 0}>Previous</Button><Button size="sm" onClick={() => setReviewIndex((value) => Math.min(attempt.wrong_indices.length - 1, value + 1))} disabled={reviewIndex >= attempt.wrong_indices.length - 1}>Next</Button><Button size="sm" variant="outline" onClick={restart}>Try again</Button></div></section>;
  }
  if (attempt) return <section aria-label="Quiz results" className="space-y-3"><h3 className="text-title-3 font-semibold">Score: {attempt.score} / {attempt.total}</h3><p>{attempt.wrong_indices.length} to review</p><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => { setReviewWrong(true); setReviewIndex(0); }} disabled={!attempt.wrong_indices.length}>Review wrong answers</Button><Button size="sm" variant="outline" onClick={restart}>Try again</Button></div><h4 className="text-body font-medium">Previous attempts</h4><ul>{attempts.map((item) => <li key={item.id} className="text-caption">{item.score}/{item.total} · {new Date(item.created_at).toLocaleString()}</li>)}</ul></section>;
  const citation = citationFor(question);
  return <section aria-label="Quiz" className="space-y-3"><div className="flex items-center justify-between text-body"><span>Question {index + 1} of {questions.length}</span><span>{answers.filter((answer) => answer >= 0).length} answered</span></div><div role="progressbar" aria-label="Quiz progress" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={index + 1} className="h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-accent" style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div><h3 className="font-medium">{question.question}</h3><fieldset className="space-y-2"><legend className="sr-only">Answer options</legend>{question.options.map((option, optionIndex) => <label key={optionIndex} className="flex min-h-11 items-center gap-2 rounded-lg border p-2 text-body hover:border-border-strong"><input type="radio" name={`quiz-${index}`} checked={answers[index] === optionIndex} onChange={() => setAnswers((old) => old.map((value, item) => item === index ? optionIndex : value))} />{option}</label>)}</fieldset>{citation && <button type="button" className="min-h-11 text-caption text-accent underline" onClick={() => onOpenCitation(citation, citations)}>Source [S{citation.n}]</button>}<div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}>Previous</Button>{index < questions.length - 1 ? <Button size="sm" onClick={() => setIndex((value) => value + 1)} disabled={answers[index] < 0}>Next</Button> : <Button size="sm" onClick={() => void submit()} disabled={answers.some((answer) => answer < 0)}>Finish quiz</Button>}</div></section>;
}
