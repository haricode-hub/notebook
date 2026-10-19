"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Material } from "@/components/ui/material";
import { authClient } from "@/lib/auth-client";

const schema = z.object({ email: z.email("Enter a valid email address") });
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [requested, setRequested] = useState(false);
  const [requestError, setRequestError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const submit = async ({ email }: FormValues) => {
    setRequestError("");
    try {
      const result = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
      if (result.error) throw new Error("request failed");
      setRequested(true);
    } catch {
      setRequestError("We couldn't submit the request. Please try again shortly.");
    }
  };

  return <main className="flex min-h-screen items-center justify-center px-4 py-12">
    <Material tone="thick" className="w-full max-w-md rounded-2xl border border-slate-200 p-8 dark:border-slate-800">
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-indigo-600">OpenNotebook Studio</p>
      <h1 className="mb-2 text-3xl font-semibold">Forgot password?</h1>
      <p className="mb-6 text-sm text-slate-600 dark:text-slate-300">Enter your email and we’ll send a secure password reset link if an account can receive it.</p>
      {requested ? <div role="status" className="space-y-5"><p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">If an account can receive email at that address, a reset link is on its way.</p><Link href="/sign-in" className="inline-flex min-h-11 items-center text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">Back to sign in</Link></div> : <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
        <div className="space-y-2"><Label htmlFor="reset-email">Email</Label><Input id="reset-email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register("email")} />{errors.email && <p role="alert" className="text-sm text-red-600">{errors.email.message}</p>}</div>
        {requestError && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{requestError}</p>}
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Sending..." : "Send reset link"}</Button>
        <Link href="/sign-in" className="inline-flex min-h-11 items-center text-sm text-indigo-600 hover:underline dark:text-indigo-400">Back to sign in</Link>
      </form>}
    </Material>
  </main>;
}
