import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '../lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md';

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color' | 'children'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm/6',
  md: 'px-4 py-2 text-sm/6'
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border-transparent text-white [--btn-bg:var(--color-blue-600)] [--btn-border:var(--color-blue-700)]/90 hover:[--btn-bg:var(--color-blue-700)]',
  secondary:
    'border-zinc-950/10 bg-white text-zinc-950 hover:bg-zinc-100 dark:border-white/15 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800',
  ghost:
    'border-transparent bg-transparent text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800'
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'relative isolate inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50',
        'bg-(--btn-border) before:absolute before:inset-0 before:-z-10 before:rounded-[calc(var(--radius-lg)-1px)] before:bg-(--btn-bg)',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
