import type { ButtonHTMLAttributes } from 'react';

import { cn } from '../lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--eq-color-accent)] text-white hover:bg-[var(--eq-color-accent-strong)] focus-visible:outline-[var(--eq-color-accent)]',
  secondary:
    'bg-[var(--eq-color-surface-alt)] text-[var(--eq-color-fg)] border border-[var(--eq-color-border)] hover:bg-[var(--eq-color-surface)] focus-visible:outline-[var(--eq-color-accent)]',
  ghost:
    'bg-transparent text-[var(--eq-color-fg-muted)] hover:bg-[var(--eq-color-surface-alt)] hover:text-[var(--eq-color-fg)] focus-visible:outline-[var(--eq-color-accent)]'
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm'
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--eq-radius-md)] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      type={type}
      {...props}
    />
  );
}
