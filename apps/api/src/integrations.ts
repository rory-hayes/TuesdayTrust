export const optionalIntegrations = {
  stripe: Boolean(process.env.STRIPE_SECRET_KEY),
  sentry: Boolean(process.env.SENTRY_DSN),
  posthog: Boolean(process.env.POSTHOG_API_KEY),
  resend: Boolean(process.env.RESEND_API_KEY),
  clerk: Boolean(process.env.CLERK_SECRET_KEY)
};
