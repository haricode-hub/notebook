"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const schema = z.object({ password: z.string().min(8, "Use at least 8 characters"), confirmPassword: z.string().min(8, "Confirm your new password") }).refine((values) => values.password === values.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });
type Values = z.infer<typeof schema>;

function ResetPasswordForm() {
  const search = useSearchParams();
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<Values>({ resolver: zodResolver(schema) });
  const token = search.get("token") ?? "";
  const submit = async (values: Values) => {
    if (!token) { setError("root", { message: "This reset link is invalid or expired. Request a new one." }); return; }
    try {
      const result = await authClient.resetPassword({ newPassword: values.password, token });
      if (result.error) { setError("root", { message: "This reset link is invalid or expired. Request a new one." }); return; }
      router.replace("/sign-in?password-reset=1");
    } catch {
      setError("root", { message: "Password reset is temporarily unavailable. Please try again." });
    }
  };
  return <main className="flex min-h-screen items-center justify-center px-4"><form onSubmit={handleSubmit(submit)} className="w-full max-w-md space-y-5 rounded-2xl border p-8">
    <h1 className="text-2xl font-semibold">Reset password</h1>
    <div className="space-y-2"><Label htmlFor="password">New password</Label><Input id="password" type="password" autoComplete="new-password" {...register("password")} />{errors.password && <p role="alert" className="text-sm text-red-600">{errors.password.message}</p>}</div>
    <div className="space-y-2"><Label htmlFor="confirmPassword">Confirm new password</Label><Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />{errors.confirmPassword && <p role="alert" className="text-sm text-red-600">{errors.confirmPassword.message}</p>}</div>
    {errors.root && <p role="alert" className="text-sm text-red-600">{errors.root.message}</p>}
    <Button disabled={isSubmitting} className="w-full">{isSubmitting ? "Updating…" : "Update password"}</Button>
  </form></main>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center p-4"><p role="status">Loading reset link...</p></main>}><ResetPasswordForm /></Suspense>;
}
