import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return <main className="flex min-h-screen items-center justify-center px-4 py-12">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-indigo-600">OpenNotebook Studio</p>
      <h1 className="mb-2 text-3xl font-semibold">Sign in</h1>
      <p className="mb-8 text-sm text-slate-500">Return to your source-grounded workspace.</p>
      <Suspense><AuthForm mode="sign-in" socials={{ google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) }} /></Suspense>
    </div>
  </main>;
}
