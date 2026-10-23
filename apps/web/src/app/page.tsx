import Link from "next/link";
import { ArrowDown, ArrowRight, BookOpenCheck, Check, ChevronDown, Quote } from "lucide-react";
import { Icon } from "@/components/icons/Icon";
import { SiteFooter } from "@/components/public-site/site-footer";
import { SiteHeader } from "@/components/public-site/site-header";
import { Button } from "@/components/ui/button";
import { comingSoonLabel, getVisibleServices, serviceCapabilities } from "@/lib/services";

const steps = [
  { number: "01", title: "Add the material", text: "Upload a document, paste a link, or add text, audio, or a video transcript to a notebook." },
  { number: "02", title: "Ask a focused question", text: "Choose which sources to use and ask about the details you need to understand." },
  { number: "03", title: "Follow the evidence", text: "Open a citation to inspect the source passage, then keep useful work as notes or study materials." },
];

const faqs = [
  { question: "What can I add to a notebook?", answer: "The workspace accepts supported documents, web links, pasted text, audio, and YouTube links. Availability depends on the file type and whether a transcript can be obtained." },
  { question: "Where do answers come from?", answer: "Chat is designed to answer from the selected notebook sources and attach citations. Check the cited passage yourself; generated answers and study materials can still make mistakes." },
  { question: "Does OpenNotebook train on my sources?", answer: "The application does not advertise a training use. When you ask a question or generate a study item, relevant content may be sent to the language model provider configured for the service. Review that provider's terms and privacy practices before adding sensitive material." },
  { question: "Is Open Notebook free to use?", answer: "The application currently has no payment or subscription flow. Use of an external model provider may have separate costs if you supply or operate a provider account." },
];

export default function Home() {
  const availableServices = getVisibleServices().filter((service) => service.status === "available");
  return <div className="min-h-screen bg-canvas text-fg">
    <SiteHeader />
    <main id="main-content">
      <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24" aria-labelledby="hero-title">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 text-small text-fg-secondary"><span className="size-1.5 rounded-full bg-accent" />A quieter place to work with what you read</p>
          <h1 id="hero-title" className="max-w-2xl font-serif text-display font-medium">Research that stays close to its sources.</h1>
          <p className="mt-6 max-w-xl text-body-lg text-fg-secondary">Bring your reading into one notebook. Ask questions, inspect the cited passages, and turn what you learn into useful study materials.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg"><Link href="/sign-up">Start a notebook <Icon icon={ArrowRight} size={16} /></Link></Button>
            <Button asChild size="lg" variant="secondary"><Link href="/#how-it-works">See how it works <Icon icon={ArrowDown} size={14} /></Link></Button>
          </div>
          <p className="mt-4 text-caption text-fg-tertiary">One service is available today. More can be added as they are built.</p>
        </div>
        <div className="relative mx-auto w-full max-w-xl" role="group" aria-label="Illustrative Open Notebook workspace preview">
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex h-11 items-center justify-between border-b border-border-subtle px-4"><div className="inline-flex items-center gap-2 text-small font-medium"><Icon icon={BookOpenCheck} size={16} />Notebook</div><span className="text-caption text-fg-tertiary">Research workspace</span></div>
            <div className="grid min-h-64 sm:grid-cols-[9.5rem_1fr]">
              <aside className="border-b border-border-subtle p-3 sm:border-b-0 sm:border-r" aria-label="Example sources"><p className="mb-3 text-caption text-fg-tertiary">SOURCES · 2</p><div className="space-y-2"><div className="rounded-sm bg-sunken p-2 text-small"><span className="block truncate font-medium">Field notes.pdf</span><span className="mt-1 block text-caption text-fg-secondary">Ready</span></div><div className="rounded-sm p-2 text-small text-fg-secondary"><span className="block truncate">Research article</span><span className="mt-1 block text-caption text-fg-secondary">Ready</span></div></div></aside>
              <div className="p-4 sm:p-5"><p className="text-caption text-fg-tertiary">A QUESTION ABOUT YOUR SOURCES</p><p className="mt-2 text-body font-medium">What are the main findings?</p><div className="my-4 border-t border-border-subtle" /><div className="flex items-start gap-2"><span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-caption text-fg-secondary">N</span><div><p className="text-body leading-6">The notes describe three recurring findings. Each one can be checked in the original passage.</p><div className="mt-3 flex flex-wrap items-center gap-2 text-caption text-fg-secondary"><Icon icon={Quote} size={13} />Source passages <span className="citation-marker px-1">1</span><span className="citation-marker px-1">2</span></div></div></div><div className="mt-5 flex items-center gap-2 rounded-md border border-border bg-raised px-3 py-2 text-small text-fg-tertiary"><span>Ask about your sources…</span><span className="ml-auto inline-flex size-6 items-center justify-center rounded-sm bg-accent text-fg-on-accent"><Icon icon={ArrowRight} size={14} /></span></div></div>
            </div>
          </div>
          <p className="mt-2 text-right text-caption text-fg-tertiary">Illustrative workspace preview</p>
        </div>
      </section>

      <section id="services" className="scroll-mt-8 border-y border-border-subtle bg-surface" aria-labelledby="services-title">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-overline text-fg-secondary">THE PLATFORM</p><h2 id="services-title" className="mt-2 font-serif text-title-1 font-medium">Services for careful work</h2><p className="mt-2 max-w-xl text-body text-fg-secondary">A growing home for focused tools. The service catalog is built to expand without changing how you find your work.</p></div><span className="text-small text-fg-secondary">{availableServices.length} available service</span></div>
          <div className="mt-8 divide-y divide-border-subtle border-y border-border-subtle">
            {availableServices.map((service) => <article key={service.id} className="grid gap-6 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="flex gap-4"><span className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm bg-sunken text-fg-secondary"><Icon icon={service.icon} size={20} /></span><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-serif text-title-2 font-medium">{service.name}</h3><span className="inline-flex items-center gap-1.5 rounded-xs bg-sunken px-2 py-0.5 text-caption text-fg-secondary"><Icon icon={Check} size={12} />Available</span></div><p className="mt-2 max-w-2xl text-body text-fg-secondary">{service.description}</p><ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-small text-fg-secondary">{service.features.map((feature) => <li key={feature} className="inline-flex items-center gap-2"><span className="size-1 rounded-full bg-border-strong" />{feature}</li>)}</ul></div></div>
              <Button asChild variant="secondary"><Link href={service.route}>{service.cta} <Icon icon={ArrowRight} size={14} /></Link></Button>
            </article>)}
          </div>
          <p className="mt-4 inline-flex items-center gap-2 text-small text-fg-tertiary"><Icon icon={ChevronDown} size={14} />{comingSoonLabel}</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16" aria-labelledby="capabilities-title">
        <div className="max-w-2xl"><p className="text-overline text-fg-secondary">OPEN NOTEBOOK</p><h2 id="capabilities-title" className="mt-2 font-serif text-title-1 font-medium">A reading space that gives the source back</h2><p className="mt-3 text-body-lg text-fg-secondary">Move from a pile of material to an answer you can inspect, save, and revisit.</p></div>
        <div className="mt-9 grid gap-x-10 sm:grid-cols-2">
          {serviceCapabilities.map(({ icon, title, description }) => <article key={title} className="flex gap-4 border-t border-border-subtle py-5"><Icon icon={icon} size={18} className="mt-0.5 shrink-0 text-fg-secondary" /><div><h3 className="text-heading font-medium">{title}</h3><p className="mt-1.5 max-w-md text-small text-fg-secondary">{description}</p></div></article>)}
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-8 border-y border-border-subtle bg-surface" aria-labelledby="how-title"><div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16"><p className="text-overline text-fg-secondary">A SIMPLE FLOW</p><h2 id="how-title" className="mt-2 font-serif text-title-1 font-medium">From source to study</h2><ol className="mt-8 grid gap-8 md:grid-cols-3">{steps.map((step) => <li key={step.number} className="border-t border-border-default pt-4"><span className="font-mono text-caption text-fg-tertiary">{step.number}</span><h3 className="mt-4 font-serif text-title-2 font-medium">{step.title}</h3><p className="mt-2 max-w-sm text-body text-fg-secondary">{step.text}</p></li>)}</ol></div></section>

      <section id="faq" className="scroll-mt-8 mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16" aria-labelledby="faq-title"><div className="grid gap-8 lg:grid-cols-3"><div><p className="text-overline text-fg-secondary">GOOD TO KNOW</p><h2 id="faq-title" className="mt-2 font-serif text-title-1 font-medium">Questions, answered plainly</h2><p className="mt-3 max-w-sm text-body text-fg-secondary">A little more about what the service does and how it handles your work.</p></div><div className="divide-y divide-border-subtle border-y border-border-subtle lg:col-span-2">{faqs.map((faq) => <details key={faq.question} className="group py-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-body font-medium marker:hidden"><span>{faq.question}</span><Icon icon={ChevronDown} size={16} className="shrink-0 text-fg-tertiary" /></summary><p className="mt-3 max-w-2xl pr-8 text-small text-fg-secondary">{faq.answer}</p></details>)}</div></div></section>

      <section className="border-t border-border-subtle bg-surface" aria-labelledby="cta-title"><div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-12 sm:px-8 sm:py-14 md:flex-row md:items-center md:justify-between"><div className="max-w-2xl"><p className="text-overline text-fg-secondary">BEGIN WITH ONE NOTEBOOK</p><h2 id="cta-title" className="mt-2 font-serif text-title-1 font-medium">Keep the question and the source together.</h2><p className="mt-2 text-body text-fg-secondary">Create an account to start a private notebook.</p></div><Button asChild size="lg"><Link href="/sign-up">Create an account <Icon icon={ArrowRight} size={16} /></Link></Button></div></section>
    </main>
    <SiteFooter />
  </div>;
}
