import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
const badgeVariants = cva("inline-flex h-5 items-center rounded-xs px-1.5 text-caption", { variants: { variant: { neutral: "bg-sunken text-fg-secondary", success: "bg-success-soft text-success", warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger", info: "bg-info-soft text-info" } }, defaultVariants: { variant: "neutral" } });
export function Badge({ variant, className, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) { return <span className={cn(badgeVariants({ variant }), className)} {...props} />; }
const chipVariants = cva("inline-flex h-7 items-center gap-1.5 rounded-sm border px-2.5 text-small transition-colors", { variants: { selected: { true: "border-transparent bg-accent-soft text-accent-soft-fg", false: "border-border bg-raised text-fg-secondary hover:border-border-strong hover:bg-hover" } }, defaultVariants: { selected: false } });
export function Chip({ selected, className, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof chipVariants>) { return <span className={cn(chipVariants({ selected }), className)} {...props} />; }
