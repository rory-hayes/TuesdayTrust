import type { ReactNode } from 'react';

export type TopbarProps = {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
};

export function Topbar({ title, subtitle, rightSlot }: TopbarProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-[var(--eq-color-border)] bg-[var(--eq-color-surface)]/95 px-6 py-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-[var(--eq-color-fg)]">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-[var(--eq-color-fg-muted)]">{subtitle}</p> : null}
        </div>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>
    </header>
  );
}
