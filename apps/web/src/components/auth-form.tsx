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

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name").or(z.literal("")).optional(),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters"),
});
type FormValues = z.infer<typeof schema>;

export function AuthForm({ mode, socials }: { mode: "sign-in" | "sign-up"; socials: { google: boolean; github: boolean } }) {
  const router = useRouter();
  const search = useSearchParams();
  const [serverError, setServerError] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "" },
  });
  const signUp = mode === "sign-up";

  async function onSubmit(values: FormValues) {
    setServerError("");
    if (signUp && (!values.name || values.name.trim().length < 2)) {
      setServerError("Enter your name");
      return;
    }
    const result = signUp
      ? await authClient.signUp.email({ name: values.name?.trim() ?? "", email: values.email, password: values.password })
      : await authClient.signIn.email({ email: values.email, password: values.password });
    if (result.error) {
      setServerError(result.error.message ?? "Authentication failed. Please try again.");
      return;
    }
    toast.success(signUp ? "Account created" : "Welcome back");
    const next = search.get("next");
    router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/notebooks");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {signUp && <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" autoComplete="name" {...register("name", { required: signUp })} />
        {errors.name && <p className="text-sm text-red-600" role="alert">{errors.name.message}</p>}
      </div>}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email && <p className="text-sm text-red-600" role="alert">{errors.email.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete={signUp ? "new-password" : "current-password"} {...register("password")} />
        {errors.password && <p className="text-sm text-red-600" role="alert">{errors.password.message}</p>}
      </div>
      {serverError && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200" role="alert">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting} className="w-full bg-indigo-600 text-white hover:bg-indigo-700">
        {isSubmitting ? "Working…" : signUp ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-slate-600 dark:text-slate-400">
        {signUp ? "Already have an account? " : "New here? "}
        <Link href={signUp ? "/sign-in" : "/sign-up"} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          {signUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
      {(socials.google || socials.github) && <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
        {socials.google && <Button type="button" variant="outline" className="w-full" onClick={() => authClient.signIn.social({ provider: "google" })}>Continue with Google</Button>}
        {socials.github && <Button type="button" variant="outline" className="w-full" onClick={() => authClient.signIn.social({ provider: "github" })}>Continue with GitHub</Button>}
      </div>}
    </form>
  );
}
