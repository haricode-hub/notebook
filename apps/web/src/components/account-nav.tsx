"use client";
import Link from "next/link";
import { Settings } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Icon } from "@/components/icons/Icon";
import { authClient } from "@/lib/auth-client";
export function AccountNav() { const { data: session } = authClient.useSession(); return <nav className="flex items-center gap-1 text-body" aria-label="Account"><span className="hidden px-2 text-fg-secondary sm:inline">{session?.user.name}</span><Link href="/settings" className="focus-ring inline-flex h-8 items-center gap-2 rounded-sm px-2.5 text-fg-secondary hover:bg-hover hover:text-fg"><Icon icon={Settings} /> <span className="hidden sm:inline">Settings</span></Link><ThemeToggle /><SignOutButton /></nav>; }
