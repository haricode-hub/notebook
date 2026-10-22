import type { HTMLAttributes } from "react";
import { AlertTriangle, CheckCircle2, Info, LoaderCircle, XCircle } from "lucide-react";
import { Icon } from "@/components/icons/Icon";
import { cn } from "@/lib/cn";
export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) { return <span role="status" aria-label={label} className={cn("inline-flex text-fg-secondary", className)}><Icon icon={LoaderCircle} className="animate-spin" /></span>; }
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div aria-hidden="true" className={cn("animate-pulse rounded-sm bg-sunken", className)} {...props} />; }
const banner = { success: { icon: CheckCircle2, style: "bg-success-soft text-success" }, warning: { icon: AlertTriangle, style: "bg-warning-soft text-warning" }, danger: { icon: XCircle, style: "bg-danger-soft text-danger" }, info: { icon: Info, style: "bg-info-soft text-info" } } as const;
export function InlineBanner({ tone = "info", children, className }: { tone?: keyof typeof banner; children: React.ReactNode; className?: string }) { const item = banner[tone]; return <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-sm px-3 py-2 text-body", item.style, className)}><Icon icon={item.icon} className="mt-1" /><div>{children}</div></div>; }
