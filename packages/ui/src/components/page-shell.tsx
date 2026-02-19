import type { ReactNode } from 'react';

import { SidebarLayout } from '../catalyst/sidebar-layout';
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
  const topbar = <Topbar rightSlot={rightSlot} subtitle={subtitle} title={title} />;

  return (
    <div className="min-h-svh">
      <SidebarLayout
        navbar={topbar}
        sidebar={<Sidebar activeHref={activeHref} items={navItems} />}
      >
        <div className="mb-6 hidden border-b border-zinc-950/10 pb-4 dark:border-white/10 lg:block">
          {topbar}
        </div>
        {children}
      </SidebarLayout>
    </div>
  );
}
