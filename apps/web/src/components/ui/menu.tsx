import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
export function Menu({ children, className }: { children: ReactNode; className?: string }) { return <div role="menu" className={cn("min-w-44 rounded-md border border-border bg-raised p-1 shadow-md", className)}>{children}</div>; }
export function MenuItem({ children, destructive, shortcut, onClick }: { children: ReactNode; destructive?: boolean; shortcut?: string; onClick?: () => void }) { return <button type="button" role="menuitem" onClick={onClick} className={cn("flex h-8 w-full items-center gap-2 rounded-sm px-2.5 text-left text-body hover:bg-hover", destructive ? "text-danger" : "text-fg")}>{children}{shortcut && <kbd className="ml-auto font-mono text-caption text-fg-tertiary">{shortcut}</kbd>}</button>; }
