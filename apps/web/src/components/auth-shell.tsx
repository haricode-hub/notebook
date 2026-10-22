import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Icon } from "@/components/icons/Icon";

export function AuthShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-canvas px-4 py-12"><section className="w-full max-w-md rounded-lg border border-border bg-surface p-6 sm:p-8"><Link href="/" className="mb-8 inline-flex items-center gap-2 text-body font-medium text-fg-secondary hover:text-fg"><Icon icon={BookOpen} size={18} /> OpenNotebook Studio</Link><h1 className="font-serif text-title-1 font-medium">{title}</h1><p className="mb-8 mt-2 text-body text-fg-secondary">{description}</p>{children}</section></main>;
}
