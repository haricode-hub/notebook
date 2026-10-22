import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";
import { accountEmailDeliveryConfigured } from "@/lib/account-email-config";
export const dynamic = "force-dynamic";
export default function SignUpPage() { return <AuthShell title="Create an account" description="Keep your notebooks, sources, and model settings together."><Suspense><AuthForm mode="sign-up" verificationRequired={accountEmailDeliveryConfigured} socials={{ google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) }} /></Suspense></AuthShell>; }
