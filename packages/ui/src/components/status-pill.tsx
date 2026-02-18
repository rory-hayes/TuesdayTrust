import { cn } from '../lib/cn';

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

const toneClasses: Record<StatusTone, string> = {
  neutral: 'bg-[var(--eq-color-surface-alt)] text-[var(--eq-color-fg-muted)]',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-rose-100 text-rose-700'
};

export type StatusPillProps = {
  label: string;
  tone?: StatusTone;
  className?: string;
};

export function StatusPill({ label, tone = 'neutral', className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        toneClasses[tone],
        className
      )}
    >
      {label}
    </span>
  );
}
