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
    <div className="relative min-h-svh bg-zinc-100 text-zinc-950 dark:bg-zinc-950 dark:text-white">
      <div className="fixed inset-y-0 left-0 hidden w-64 p-2 md:block">
        <Sidebar activeHref={activeHref} items={navItems} />
      </div>
      <div className="flex min-h-svh flex-col md:pl-64">
        <Topbar {...topbarProps} />
        <main className="flex-1 p-6 md:p-8">
          <div className="mx-auto max-w-6xl rounded-2xl bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10 md:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
