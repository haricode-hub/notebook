import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { Pool } from "pg";
import { accountEmailDeliveryConfigured } from "@/lib/account-email-config";

const publicOrigin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

async function deliverAccountEmail(input: { to: string; subject: string; text: string; html?: string }) {
  const token = process.env.ACCOUNT_INTERNAL_TOKEN;
  if (!token) throw new Error("Account email delivery is not configured");
  const response = await fetch(`${process.env.API_URL ?? "http://localhost:8000"}/internal/email`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Account email delivery is temporarily unavailable");
}

const socialProviders = {
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
    : {}),
  ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? { github: { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET } }
    : {}),
};

export const auth = betterAuth({
  appName: "OpenNotebook Studio",
  baseURL: publicOrigin,
  secret: process.env.BETTER_AUTH_SECRET,
  database: new Pool({ connectionString: process.env.BETTER_AUTH_DATABASE_URL, max: 10 }),
  trustedOrigins: [publicOrigin],
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: accountEmailDeliveryConfigured,
    sendResetPassword: async ({ user, url }) => deliverAccountEmail({
      to: user.email,
      subject: "Reset your OpenNotebook Studio password",
      text: `Use this one-time link to reset your password: ${url}\nIf you did not request this, ignore this email.`,
      html: `<p>Use this one-time link to reset your password:</p><p><a href="${url}">Reset password</a></p><p>If you did not request this, ignore this email.</p>`,
    }),
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendOnSignUp: accountEmailDeliveryConfigured,
    sendOnSignIn: false,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => deliverAccountEmail({
      to: user.email,
      subject: "Verify your OpenNotebook Studio email",
      text: `Verify your email using this one-time link: ${url}`,
      html: `<p>Verify your email using this one-time link:</p><p><a href="${url}">Verify email</a></p>`,
    }),
  },
  socialProviders,
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "user", input: false },
    },
    changeEmail: {
      enabled: true,
      sendChangeEmailVerification: async ({ user, newEmail, url }: { user: { email: string }; newEmail: string; url: string }) => deliverAccountEmail({
        to: newEmail,
        subject: "Confirm your new OpenNotebook Studio email",
        text: `Confirm this email change for ${user.email}: ${url}`,
        html: `<p>Confirm this email change:</p><p><a href="${url}">Confirm email change</a></p>`,
      }),
    },
    deleteUser: {
      enabled: true,
      sendDeleteAccountVerification: async ({ user, url }) => deliverAccountEmail({
        to: user.email,
        subject: "Confirm OpenNotebook Studio account deletion",
        text: `Confirm permanent account and notebook data deletion: ${url}`,
        html: `<p>Confirm permanent account and notebook data deletion:</p><p><a href="${url}">Delete account</a></p>`,
      }),
      beforeDelete: async (user) => {
        const token = process.env.ACCOUNT_INTERNAL_TOKEN;
        if (!token) throw new Error("Account deletion is not configured");
        const response = await fetch(`${process.env.API_URL ?? "http://localhost:8000"}/internal/accounts/${encodeURIComponent(user.id)}/data`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error("Account data cleanup is temporarily unavailable");
      },
    },
  },
  account: {
    accountLinking: { enabled: true, disableImplicitLinking: true },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
      "/send-verification-email": { window: 60, max: 3 },
      "/change-email": { window: 60, max: 3 },
      "/delete-user": { window: 60, max: 2 },
    },
  },
  plugins: [
    jwt({
      jwt: {
        issuer: publicOrigin,
        audience: "opennotebook-api",
        expirationTime: "15m",
        definePayload: ({ user }) => ({ role: user.role ?? "user" }),
      },
    }),
  ],
});
