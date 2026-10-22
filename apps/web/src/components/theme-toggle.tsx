"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons/Icon";

export function ThemeToggle() {
  const { resolvedTheme, theme, setTheme } = useTheme();
  const nextTheme = theme === "dark" ? "system" : theme === "light" ? "dark" : resolvedTheme === "dark" ? "light" : "dark";
  return <Button type="button" variant="ghost" size="icon" aria-label="Toggle theme" title={`Appearance: ${theme ?? "system"}. Next: ${nextTheme}`} onClick={() => setTheme(nextTheme)}>
    <Icon icon={Sun} className="hidden dark:block" /><Icon icon={Moon} className="dark:hidden" />
  </Button>;
}
