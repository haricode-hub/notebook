import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { Pool } from "pg";

const publicOrigin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

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
  emailAndPassword: { enabled: true },
  socialProviders,
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "user", input: false },
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
