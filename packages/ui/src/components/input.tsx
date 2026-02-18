import type { InputHTMLAttributes } from 'react';

import { cn } from '../lib/cn';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-[var(--eq-radius-md)] border border-[var(--eq-color-border)] bg-[var(--eq-color-surface)] px-3 text-sm text-[var(--eq-color-fg)] placeholder:text-[var(--eq-color-fg-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--eq-color-accent)] focus-visible:outline-offset-2',
        className
      )}
      {...props}
    />
  );
}
