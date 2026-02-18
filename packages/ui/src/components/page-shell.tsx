import type { ReactNode } from 'react';

import type { SidebarItem } from './sidebar';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export type PageShellProps = {
  children: ReactNode;
  title: string;
  subtitle?: string;
  navItems: SidebarItem[];
  activeHref: string;
  rightSlot?: ReactNode;
};

export function PageShell({
  children,
  title,
  subtitle,
  navItems,
  activeHref,
  rightSlot
}: PageShellProps) {
  const topbarProps = {
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(rightSlot ? { rightSlot } : {})
  };

  return (
    <div className="min-h-screen bg-[var(--eq-color-bg-subtle)] text-[var(--eq-color-fg)] md:flex">
      <Sidebar activeHref={activeHref} items={navItems} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar {...topbarProps} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
