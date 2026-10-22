"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const commonSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").or(z.literal("")).optional(),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters"),
});
const signInSchema = commonSchema.extend({ confirmPassword: z.string().optional() });
const signUpSchema = commonSchema.extend({
  name: z.string().trim().min(2, "Enter your name"),
  confirmPassword: z.string().min(8, "Confirm your password"),
}).refine((values) => values.password === values.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });
type FormValues = z.infer<typeof signInSchema> | z.infer<typeof signUpSchema>;

export function AuthForm({ mode, socials, verificationRequired = false }: { mode: "sign-in" | "sign-up"; socials: { google: boolean; github: boolean }; verificationRequired?: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const signUp = mode === "sign-up";
  const [serverError, setServerError] = useState("");
  const [statusMessage, setStatusMessage] = useState(() => search.get("password-reset") === "1" ? "Your password has been updated. Sign in with your new password." : "");
  const validationSchema = signUp ? signUpSchema : signInSchema;
  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(validationSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });
  async function onSubmit(values: FormValues) {
    setServerError("");
    if (signUp && (!values.name || values.name.trim().length < 2)) {
      setServerError("Enter your name");
      return;
    }
    try {
      const result = signUp
        ? await authClient.signUp.email({ name: values.name?.trim() ?? "", email: values.email, password: values.password })
        : await authClient.signIn.email({ email: values.email, password: values.password });
      if (result.error) {
        setServerError(signUp ? result.error.message ?? "Could not create your account. Please try again." : "Invalid email or password.");
        return;
      }
      if (signUp && verificationRequired) {
        setStatusMessage("Your account was created. Check your email for a verification link before signing in.");
        return;
      }
      toast.success(signUp ? "Account created" : "Welcome back");
      const next = search.get("next");
      const safeNext = next?.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/notebooks";
      router.replace(safeNext);
      router.refresh();
    } catch {
      setServerError("Authentication is temporarily unavailable. Check your connection and try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {signUp && <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" autoComplete="name" aria-invalid={Boolean(errors.name)} {...register("name", { required: signUp })} />
        {errors.name && <p className="text-small text-danger" role="alert">{errors.name.message}</p>}
      </div>}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register("email")} />
        {errors.email && <p className="text-small text-danger" role="alert">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete={signUp ? "new-password" : "current-password"} aria-invalid={Boolean(errors.password)} {...register("password")} />
        {errors.password && <p className="text-small text-danger" role="alert">{errors.password.message}</p>}
      </div>
      {signUp && <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input id="confirmPassword" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.confirmPassword)} {...register("confirmPassword")} />
        {errors.confirmPassword && <p className="text-small text-danger" role="alert">{errors.confirmPassword.message}</p>}
      </div>}
      {serverError && <p className="rounded-sm bg-danger-soft p-3 text-body text-danger" role="alert">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting} className="h-11 w-full">
        {isSubmitting ? "Working…" : signUp ? "Create account" : "Sign in"}
      </Button>
      {!signUp && <div className="flex flex-wrap justify-center gap-4 text-body">
        <Link href="/forgot-password" className="inline-flex items-center text-accent hover:underline">Forgot password?</Link>
        <button type="button" className="text-accent hover:underline" onClick={async () => {
          const email = getValues("email");
          if (!z.email().safeParse(email).success) { setServerError("Enter your email above first."); return; }
          setServerError("");
          try {
            const result = await authClient.sendVerificationEmail({ email, callbackURL: "/notebooks" });
            if (result.error) throw new Error("email failed");
            setStatusMessage("If verification is needed, a message will be sent to that address.");
          } catch {
            setServerError("We couldn't send a verification link. Try again shortly.");
          }
        }}>Resend verification email</button>
      </div>}
      {statusMessage && <p role="status" className="text-center text-body text-success">{statusMessage}</p>}
      <p className="text-center text-body text-fg-secondary">
        {signUp ? "Already have an account? " : "New here? "}
        <Link href={signUp ? "/sign-in" : "/sign-up"} className="font-medium text-accent hover:underline">
          {signUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
      {(socials.google || socials.github) && <div className="space-y-2 border-t border-border-subtle pt-4">
        {socials.google && <Button type="button" variant="outline" className="w-full" onClick={() => authClient.signIn.social({ provider: "google" })}>Continue with Google</Button>}
        {socials.github && <Button type="button" variant="outline" className="w-full" onClick={() => authClient.signIn.social({ provider: "github" })}>Continue with GitHub</Button>}
      </div>}
    </form>
  );
}
