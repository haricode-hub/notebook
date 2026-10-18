import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AccountNav } from "@/components/account-nav";
import { auth } from "@/lib/auth";

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return <div className="min-h-screen">
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-950">
      <Link href="/notebooks" className="font-semibold tracking-tight">OpenNotebook Studio</Link>
      <AccountNav />
    </header>
    {children}
  </div>;
}
