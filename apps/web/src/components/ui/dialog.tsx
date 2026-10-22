"use client";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/cn";
function useDialogKeys(open: boolean, onClose: () => void, container: RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const getFocusable = () => [...(container.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])];
    const focusTimer = window.requestAnimationFrame(() => (getFocusable()[0] ?? container.current)?.focus());
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) { event.preventDefault(); container.current?.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { window.cancelAnimationFrame(focusTimer); document.removeEventListener("keydown", handleKey); previous?.focus(); };
  }, [container, open]);
}

export function Dialog({ open, onClose, title, description, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" }) {
  const container = useRef<HTMLElement>(null);
  const titleId = useId();
  useDialogKeys(open, onClose, container);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={container} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn("relative w-full rounded-lg border border-border bg-raised p-6 shadow-lg", size === "sm" && "max-w-sm", size === "md" && "max-w-xl", size === "lg" && "max-w-3xl")}><div className="pr-10"><h2 id={titleId} className="font-serif text-title-2 font-medium">{title}</h2>{description && <p className="mt-2 text-body text-fg-secondary">{description}</p>}</div><IconButton label="Close" icon={X} className="absolute right-4 top-4" onClick={onClose} /><div className="mt-6">{children}</div>{footer && <footer className="mt-6 flex justify-end gap-2">{footer}</footer>}</section></div>;
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const container = useRef<HTMLElement>(null);
  useDialogKeys(open, onClose, container);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 bg-fg/40" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside ref={container} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-border bg-raised shadow-lg"><header className="flex h-12 items-center justify-between border-b border-border-subtle px-4"><h2 className="text-heading font-semibold">{title}</h2><IconButton label="Close" icon={X} onClick={onClose} /></header><div className="min-h-0 flex-1 overflow-auto p-4">{children}</div></aside></div>;
}
