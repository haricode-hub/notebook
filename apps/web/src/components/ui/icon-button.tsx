import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "@/components/icons/Icon";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
export const IconButton = React.forwardRef<HTMLButtonElement, Omit<ButtonProps, "children" | "aria-label"> & { label: string; icon: LucideIcon; header?: boolean }>(({ label, icon, header, ...props }, ref) => <Tooltip label={label}><Button ref={ref} type="button" variant="ghost" size="icon" aria-label={label} className={header ? "header-icon" : undefined} {...props}><Icon icon={icon} size={header ? 18 : 16} /></Button></Tooltip>);
IconButton.displayName = "IconButton";
