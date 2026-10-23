import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Icon } from "@/components/icons/Icon";

export function SiteFooter() {
  return (
    <footer className="border-t border-border-subtle">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 font-serif text-title-3 font-medium"><Icon icon={BookOpen} size={18} />OpenNotebook Studio</Link>
          <p className="mt-2 max-w-sm text-small text-fg-secondary">A workspace for reading, asking, and keeping research connected to its sources.</p>
        </div>
        <nav aria-label="Legal and support" className="flex flex-wrap gap-x-5 gap-y-2 text-small text-fg-secondary">
          <Link className="hover:text-fg" href="/privacy">Privacy</Link>
          <Link className="hover:text-fg" href="/terms">Terms</Link>
          <Link className="hover:text-fg" href="/cookies">Cookies</Link>
          <Link className="hover:text-fg" href="/contact">Contact</Link>
        </nav>
      </div>
      <div className="border-t border-border-subtle px-5 py-3 text-center text-caption text-fg-tertiary">Copyright {new Date().getFullYear()} OpenNotebook Studio</div>
    </footer>
  );
}
