import type { Metadata } from 'next';

import '@evidenceq/ui/tokens.css';

import { SentryInit } from '../components/sentry-init';
import './globals.css';

export const metadata: Metadata = {
  title: 'EvidenceQ',
  description: 'Consultant-mode security questionnaire workspace'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className="text-zinc-950 antialiased dark:bg-zinc-950 dark:text-white" lang="en">
      <head>
        <link href="https://rsms.me/" rel="preconnect" />
        <link href="https://rsms.me/inter/inter.css" rel="stylesheet" />
      </head>
      <body>
        <SentryInit />
        {children}
      </body>
    </html>
  );
}
