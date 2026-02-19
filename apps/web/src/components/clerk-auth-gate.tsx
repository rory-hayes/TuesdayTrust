'use client';

import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut
} from '@clerk/nextjs';
import type { ReactNode } from 'react';

type ClerkAuthGateProps = {
  children: ReactNode;
};

export function ClerkAuthGate({ children }: ClerkAuthGateProps) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <main className="flex min-h-svh items-center justify-center bg-[var(--eq-color-bg-subtle)] p-6">
          <section className="w-full max-w-md rounded-2xl border border-zinc-950/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
            <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-100">EvidenceQ</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Sign in to access your consultant workspace.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <SignInButton mode="modal">
                <button className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="inline-flex items-center justify-center rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600">
                  Sign up
                </button>
              </SignUpButton>
            </div>
          </section>
        </main>
      </SignedOut>
    </>
  );
}
