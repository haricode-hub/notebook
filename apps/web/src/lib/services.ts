import { AudioLines, BookOpenCheck, FileQuestion, Network, ScrollText, type LucideIcon } from "lucide-react";

export type PlatformService = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  route: string;
  status: "available" | "coming-soon";
  features: readonly string[];
  cta: string;
  visible: boolean;
};

export const services: readonly PlatformService[] = [
  {
    id: "open-notebook",
    name: "Open Notebook",
    description: "Bring your sources together, ask questions, and keep the evidence beside every answer.",
    icon: BookOpenCheck,
    route: "/notebooks",
    status: "available",
    features: ["PDFs, documents, links, audio, and video", "Answers with clickable citations", "Guides, flashcards, quizzes, and more"],
    cta: "Open the workspace",
    visible: true,
  },
];

export const serviceCapabilities = [
  { icon: FileQuestion, title: "Ask from your sources", description: "Chat with selected notebook sources and follow each citation to its passage." },
  { icon: ScrollText, title: "Make study materials", description: "Generate briefs, guides, FAQs, timelines, reports, flashcards, quizzes, and mind maps." },
  { icon: AudioLines, title: "Work across formats", description: "Add documents, web pages, YouTube transcripts, and audio to a notebook." },
  { icon: Network, title: "Keep research together", description: "Organize sources, notes, and generated materials in notebooks." },
] as const;

export const comingSoonLabel = "More services will appear here as they become available.";

export function getVisibleServices() {
  return services.filter((service) => service.visible);
}
