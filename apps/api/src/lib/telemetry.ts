import * as Sentry from '@sentry/node';

const sentryDsn = process.env.SENTRY_DSN?.trim();
const posthogKey = process.env.POSTHOG_KEY?.trim() || process.env.POSTHOG_API_KEY?.trim();
const posthogHost = (process.env.POSTHOG_HOST?.trim() || 'https://us.i.posthog.com').replace(/\/+$/, '');

let sentryInitialized = false;

export function initApiTelemetry(): void {
  if (!sentryDsn || sentryInitialized) {
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0
  });

  sentryInitialized = true;
}

export async function closeApiTelemetry(): Promise<void> {
  if (!sentryInitialized) {
    return;
  }

  await Sentry.flush(1500);
}

export function captureApiException(
  error: unknown,
  context: {
    requestId?: string;
    route?: string;
    method?: string;
    orgId?: string;
    userId?: string;
  } = {}
): void {
  if (!sentryInitialized) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context.requestId) {
      scope.setTag('request_id', context.requestId);
    }

    if (context.route) {
      scope.setTag('route', context.route);
    }

    if (context.method) {
      scope.setTag('method', context.method);
    }

    if (context.orgId) {
      scope.setTag('org_id', context.orgId);
    }

    if (context.userId) {
      scope.setTag('user_id', context.userId);
    }

    Sentry.captureException(error);
  });
}

export async function captureApiEvent(input: {
  event: string;
  distinctId: string;
  orgId?: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  if (!posthogKey) {
    return;
  }

  try {
    await fetch(`${posthogHost}/capture/`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        api_key: posthogKey,
        event: input.event,
        distinct_id: input.distinctId,
        properties: {
          orgId: input.orgId,
          ...input.properties
        }
      })
    });
  } catch {
    // analytics is non-blocking
  }
}
