import { Badge } from '../catalyst/badge';
import { cn } from '../lib/cn';

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

const toneColors: Record<StatusTone, 'zinc' | 'emerald' | 'amber' | 'rose'> = {
  neutral: 'zinc',
  success: 'emerald',
  warning: 'amber',
  danger: 'rose'
};

export type StatusPillProps = {
  label: string;
  tone?: StatusTone;
  className?: string;
};

export function StatusPill({ label, tone = 'neutral', className }: StatusPillProps) {
  return (
    <Badge className={cn('uppercase tracking-wide', className)} color={toneColors[tone]}>
      {label}
    </Badge>
  );
}
