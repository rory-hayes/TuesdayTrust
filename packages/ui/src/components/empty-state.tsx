import type { ReactNode } from 'react';

import { Button } from './button';

export type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
};

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <div className="rounded-[var(--eq-radius-lg)] border border-dashed border-[var(--eq-color-border)] bg-[var(--eq-color-surface)] p-8 text-center">
      {icon ? <div className="mb-3 flex justify-center text-[var(--eq-color-fg-muted)]">{icon}</div> : null}
      <h3 className="text-base font-semibold text-[var(--eq-color-fg)]">{title}</h3>
      <p className="mt-2 text-sm text-[var(--eq-color-fg-muted)]">{description}</p>
      {actionLabel ? (
        <div className="mt-5">
          <Button onClick={onAction} size="sm" variant="secondary">
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
