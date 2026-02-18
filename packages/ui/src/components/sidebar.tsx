import { cn } from '../lib/cn';

export type SidebarItem = {
  label: string;
  href: string;
  badge?: string;
};

export type SidebarProps = {
  items: SidebarItem[];
  activeHref: string;
};

export function Sidebar({ items, activeHref }: SidebarProps) {
  return (
    <aside className="w-full border-r border-[var(--eq-color-border)] bg-[var(--eq-color-surface)] md:w-64">
      <div className="border-b border-[var(--eq-color-border)] px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--eq-color-fg-muted)]">EvidenceQ</p>
        <p className="mt-1 text-sm text-[var(--eq-color-fg)]">Consultant workspace</p>
      </div>
      <nav className="space-y-1 p-3">
        {items.map((item) => {
          const isActive = activeHref === item.href || activeHref.startsWith(`${item.href}/`);

          return (
            <a
              className={cn(
                'flex items-center justify-between rounded-[var(--eq-radius-md)] px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-[var(--eq-color-accent-soft)] text-[var(--eq-color-accent-strong)]'
                  : 'text-[var(--eq-color-fg-muted)] hover:bg-[var(--eq-color-surface-alt)] hover:text-[var(--eq-color-fg)]'
              )}
              href={item.href}
              key={item.href}
            >
              <span>{item.label}</span>
              {item.badge ? (
                <span className="rounded-full bg-[var(--eq-color-surface-alt)] px-2 py-0.5 text-xs text-[var(--eq-color-fg-muted)]">
                  {item.badge}
                </span>
              ) : null}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
