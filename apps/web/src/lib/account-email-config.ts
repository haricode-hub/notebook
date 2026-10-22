/** Email verification is safe to require only when Better Auth can reach the
 * authenticated API SMTP relay. SMTP_HOST by itself is not sufficient. */
export const accountEmailDeliveryConfigured = Boolean(
  process.env.SMTP_HOST?.trim() && process.env.ACCOUNT_INTERNAL_TOKEN?.trim(),
);
