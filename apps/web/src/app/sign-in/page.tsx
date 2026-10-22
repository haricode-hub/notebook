import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
export const dynamic = "force-dynamic";
export default function SignInPage() { return <AuthShell title="Sign in" description="Return to your source-grounded workspace."><Suspense><AuthForm mode="sign-in" socials={{ google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) }} /></Suspense></AuthShell>; }
