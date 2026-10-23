import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public-site/legal-page";

export const metadata: Metadata = { title: "Contact and support", description: "Contact information for OpenNotebook Studio support and privacy requests.", alternates: { canonical: "/contact" } };

export default function ContactPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  return <PublicPage><main id="main-content" className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16"><p className="text-overline text-fg-secondary">OPEN NOTEBOOK STUDIO</p><h1 className="mt-3 font-serif text-display font-medium">Contact and support</h1><p className="mt-4 max-w-2xl text-body-lg text-fg-secondary">For account, data, or product questions, use the support contact below.</p><div className="mt-8 border-y border-border-subtle py-6">{supportEmail ? <p className="text-body">Email <a className="text-accent underline underline-offset-4" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p> : <div role="status" className="space-y-2"><p className="text-body font-medium">Support contact is not configured.</p><p className="text-small text-fg-secondary">The site operator needs to set <code className="rounded-xs bg-sunken px-1 py-0.5 font-mono text-caption">NEXT_PUBLIC_SUPPORT_EMAIL</code> to a monitored address before public launch. Do not use this deployment for privacy or account requests until a support contact is available.</p></div>}</div><p className="mt-6 text-small text-fg-secondary">Read the <Link className="text-accent underline underline-offset-4" href="/privacy">privacy policy</Link> or return to the <Link className="text-accent underline underline-offset-4" href="/">home page</Link>.</p></main></PublicPage>;
}
