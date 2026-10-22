"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { InlineBanner, Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
const schema = z.object({ password: z.string().min(8, "Use at least 8 characters"), confirmPassword: z.string().min(8, "Confirm your new password") }).refine((values) => values.password === values.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });
type Values = z.infer<typeof schema>;
function ResetPasswordForm() { const search = useSearchParams(); const router = useRouter(); const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<Values>({ resolver: zodResolver(schema) }); const token = search.get("token") ?? ""; const submit = async (values: Values) => { if (!token) { setError("root", { message: "This reset link is invalid or expired. Request a new one." }); return; } try { const result = await authClient.resetPassword({ newPassword: values.password, token }); if (result.error) { setError("root", { message: "This reset link is invalid or expired. Request a new one." }); return; } router.replace("/sign-in?password-reset=1"); } catch { setError("root", { message: "Password reset is temporarily unavailable. Try again." }); } }; return <AuthShell title="Choose a new password" description="Use at least 8 characters."><form onSubmit={handleSubmit(submit)} className="space-y-5"><div className="space-y-1.5"><Label htmlFor="password">New password</Label><Input id="password" type="password" autoComplete="new-password" {...register("password")} />{errors.password && <p role="alert" className="text-small text-danger">{errors.password.message}</p>}</div><div className="space-y-1.5"><Label htmlFor="confirmPassword">Confirm new password</Label><Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />{errors.confirmPassword && <p role="alert" className="text-small text-danger">{errors.confirmPassword.message}</p>}</div>{errors.root && <InlineBanner tone="danger">{errors.root.message}</InlineBanner>}<Button loading={isSubmitting} className="w-full">Update password</Button></form></AuthShell>; }
export default function ResetPasswordPage() { return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-canvas p-4"><Skeleton className="h-80 w-full max-w-md" /></main>}><ResetPasswordForm /></Suspense>; }
