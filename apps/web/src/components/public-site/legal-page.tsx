import type { ReactNode } from "react";
import { SiteFooter } from "@/components/public-site/site-footer";
import { SiteHeader } from "@/components/public-site/site-header";

export function PublicPage({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-canvas text-fg"><SiteHeader />{children}<SiteFooter /></div>;
}

export function LegalPage({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return <PublicPage><main id="main-content" className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16"><p className="text-overline text-fg-secondary">OpenNotebook Studio · policy</p><h1 className="mt-3 font-serif text-display font-medium">{title}</h1><p className="mt-4 max-w-2xl text-body-lg text-fg-secondary">{summary}</p><div className="mt-10 space-y-8 text-body-lg [&_h2]:font-serif [&_h2]:text-title-2 [&_h2]:font-medium [&_h2]:text-fg [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-4">{children}</div><p className="mt-12 border-t border-border-subtle pt-4 text-small text-fg-secondary">Last reviewed: <time dateTime="2026-10-23">October 23, 2026</time>. This page is a product disclosure draft and needs review by the operator and qualified counsel before public launch.</p></main></PublicPage>;
}
