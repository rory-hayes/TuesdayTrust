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
    <html lang="en">
      <body>
        <SentryInit />
        {children}
      </body>
    </html>
  );
}
