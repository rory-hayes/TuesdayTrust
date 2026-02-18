import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

export type ModalShellProps = {
  children: ReactNode;
  title: string;
  description?: string;
  isOpen: boolean;
  className?: string;
};

export function ModalShell({ children, title, description, isOpen, className }: ModalShellProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={cn(
          'w-full max-w-xl rounded-[var(--eq-radius-lg)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface)] p-5 shadow-xl',
          className
        )}
      >
        <h2 className="text-base font-semibold text-[var(--eq-color-fg)]">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[var(--eq-color-fg-muted)]">{description}</p> : null}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
