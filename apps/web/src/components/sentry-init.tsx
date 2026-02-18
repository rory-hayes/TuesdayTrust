'use client';

import { useEffect } from 'react';

let initialized = false;

export function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

    if (!dsn || initialized) {
      return;
    }

    void import('@sentry/browser')
      .then((Sentry) => {
        Sentry.init({
          dsn,
          environment: process.env.NODE_ENV ?? 'development',
          tracesSampleRate: 0
        });
        initialized = true;
      })
      .catch(() => {
        return;
      });
  }, []);

  return null;
}
