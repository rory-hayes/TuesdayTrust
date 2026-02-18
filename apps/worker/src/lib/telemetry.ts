import * as Sentry from '@sentry/node';

const sentryDsn = process.env.SENTRY_DSN?.trim();
const posthogKey = process.env.POSTHOG_KEY?.trim() || process.env.POSTHOG_API_KEY?.trim();
const posthogHost = (process.env.POSTHOG_HOST?.trim() || 'https://us.i.posthog.com').replace(/\/+$/, '');

let sentryInitialized = false;

export function initWorkerTelemetry(): void {
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

export async function closeWorkerTelemetry(): Promise<void> {
  if (!sentryInitialized) {
    return;
  }

  await Sentry.flush(1500);
}

export function captureWorkerException(
  error: unknown,
  context: {
    queue?: string;
    jobId?: string | number | null;
    orgId?: string;
    clientId?: string;
    projectId?: string;
  } = {}
): void {
  if (!sentryInitialized) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context.queue) {
      scope.setTag('queue', context.queue);
    }

    if (context.jobId !== undefined && context.jobId !== null) {
      scope.setTag('job_id', String(context.jobId));
    }

    if (context.orgId) {
      scope.setTag('org_id', context.orgId);
    }

    if (context.clientId) {
      scope.setTag('client_id', context.clientId);
    }

    if (context.projectId) {
      scope.setTag('project_id', context.projectId);
    }

    Sentry.captureException(error);
  });
}

export async function captureWorkerEvent(input: {
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
