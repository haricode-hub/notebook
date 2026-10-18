"use client";

import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { authClient } from "@/lib/auth-client";

export function AccountNav() {
  const { data: session } = authClient.useSession();
  return <nav className="flex items-center gap-1 text-sm" aria-label="Account">
    <span className="hidden px-2 text-slate-500 sm:inline">{session?.user.name}</span>
    <Link href="/settings" className="rounded-md px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">Settings</Link>
    <ThemeToggle />
    <SignOutButton />
  </nav>;
}
