export type IntegrationStatus = {
  name: string;
  enabled: boolean;
};

export const integrationStatus: IntegrationStatus[] = [
  {
    name: 'Clerk',
    enabled: Boolean(process.env.CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY)
  },
  {
    name: 'Stripe',
    enabled: Boolean(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && process.env.STRIPE_SECRET_KEY
    )
  },
  {
    name: 'PostHog',
    enabled: Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)
  },
  {
    name: 'Sentry',
    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)
  },
  {
    name: 'Resend',
    enabled: Boolean(process.env.RESEND_API_KEY)
  }
];
