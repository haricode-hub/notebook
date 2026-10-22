"use client";
import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { InlineBanner } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
const schema = z.object({ email: z.email("Enter a valid email address") });
type FormValues = z.infer<typeof schema>;
export default function ForgotPasswordPage() {
  const [requested, setRequested] = useState(false); const [requestError, setRequestError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const submit = async ({ email }: FormValues) => { setRequestError(""); try { const result = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" }); if (result.error) throw new Error("request failed"); setRequested(true); } catch { setRequestError("We couldn't submit the request. Try again shortly."); } };
  return <AuthShell title="Reset your password" description="Enter your email and we’ll send a secure reset link if the account can receive it.">{requested ? <div className="space-y-5"><InlineBanner tone="success">If the account can receive email, a reset link is on its way.</InlineBanner><Button asChild variant="link"><Link href="/sign-in">Back to sign in</Link></Button></div> : <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate><div className="space-y-1.5"><Label htmlFor="reset-email">Email</Label><Input id="reset-email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register("email")} />{errors.email && <p role="alert" className="text-small text-danger">{errors.email.message}</p>}</div>{requestError && <InlineBanner tone="danger">{requestError}</InlineBanner>}<Button type="submit" className="w-full" loading={isSubmitting}>Send reset link</Button><Button asChild variant="link"><Link href="/sign-in">Back to sign in</Link></Button></form>}</AuthShell>;
}
