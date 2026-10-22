import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { AccountNav } from "@/components/account-nav";
import { Icon } from "@/components/icons/Icon";
import { auth } from "@/lib/auth";
export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) { const session = await auth.api.getSession({ headers: await headers() }); if (!session) redirect("/sign-in"); return <div className="min-h-screen bg-canvas"><header className="flex h-13 items-center justify-between border-b border-border-subtle px-5 sm:px-6"><Link href="/notebooks" aria-label="OpenNotebook Studio" className="inline-flex items-center gap-2.5 whitespace-nowrap font-serif text-title-3 font-medium text-fg"><span className="inline-flex size-8 items-center justify-center rounded-sm bg-sunken text-fg-secondary"><Icon icon={BookOpen} size={20} /></span>OpenNotebook <span className="hidden sm:inline">Studio</span></Link><AccountNav /></header>{children}</div>; }
