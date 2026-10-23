import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { Icon } from "@/components/icons/Icon";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <>
      <Link href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-sm focus:bg-raised focus:px-3 focus:py-2 focus:text-body focus:text-fg focus:shadow-md">Skip to content</Link>
      <header className="border-b border-border-subtle bg-surface">
      <div className="mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="inline-flex shrink-0 items-center gap-2.5 font-serif text-title-3 font-medium" aria-label="OpenNotebook Studio home">
          <span className="inline-flex size-8 items-center justify-center rounded-sm bg-sunken text-fg-secondary"><Icon icon={BookOpen} size={18} /></span>
          <span className="sm:hidden">Studio</span><span className="hidden sm:inline">OpenNotebook Studio</span>
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-6 text-small text-fg-secondary md:flex">
          <Link className="hover:text-fg" href="/#services">Services</Link>
          <Link className="hover:text-fg" href="/#how-it-works">How it works</Link>
          <Link className="hover:text-fg" href="/#faq">FAQ</Link>
        </nav>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <Button asChild size="sm" variant="ghost"><Link href="/sign-in">Sign in</Link></Button>
          <Button asChild size="sm"><Link href="/sign-up">Create account <Icon icon={ArrowUpRight} size={14} /></Link></Button>
        </div>
      </div>
      </header>
    </>
  );
}
