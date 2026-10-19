import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type MaterialTone = "thin" | "regular" | "thick";

export function Material({ className, tone = "regular", ...props }: HTMLAttributes<HTMLDivElement> & { tone?: MaterialTone }) {
  return <div className={cn("material-surface", `material-${tone}`, className)} {...props} />;
}
