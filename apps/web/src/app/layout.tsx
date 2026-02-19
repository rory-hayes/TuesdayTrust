import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';

import '@evidenceq/ui/tokens.css';

import { ClerkApiAuthBridge } from '../components/clerk-api-auth-bridge';
import { ClerkAuthGate } from '../components/clerk-auth-gate';
import { ClerkAuthControls } from '../components/clerk-auth-controls';
import { SentryInit } from '../components/sentry-init';
import './globals.css';

export const metadata: Metadata = {
  title: 'EvidenceQ',
  description: 'Consultant-mode security questionnaire workspace'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const hasClerkKeys = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  const content = (
    <html className="text-zinc-950 antialiased dark:bg-zinc-950 dark:text-white" lang="en">
      <head>
        <link href="https://rsms.me/" rel="preconnect" />
        <link href="https://rsms.me/inter/inter.css" rel="stylesheet" />
      </head>
      <body>
        <SentryInit />
        {hasClerkKeys ? (
          <>
            <ClerkApiAuthBridge />
            <ClerkAuthControls />
            <ClerkAuthGate>{children}</ClerkAuthGate>
          </>
        ) : (
          children
        )}
      </body>
    </html>
  );

  if (!hasClerkKeys) {
    return content;
  }

  return (
    <ClerkProvider>
      {content}
    </ClerkProvider>
  );
}
