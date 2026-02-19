'use client';

import {
  SignedIn,
  UserButton
} from '@clerk/nextjs';

export function ClerkAuthControls() {
  return (
    <div className="fixed top-3 right-4 z-50 flex items-center gap-2">
      <SignedIn>
        <div className="rounded-full border border-zinc-200 bg-white/95 p-1 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/95">
          <UserButton afterSignOutUrl="/" />
        </div>
      </SignedIn>
    </div>
  );
}
