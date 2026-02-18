import { Badge } from '../catalyst/badge';
import {
  Sidebar as CatalystSidebar,
  SidebarBody,
  SidebarHeader,
  SidebarItem as CatalystSidebarItem,
  SidebarLabel,
  SidebarSection
} from '../catalyst/sidebar';
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
    <aside className="w-full bg-white ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10 md:w-64">
      <CatalystSidebar>
        <SidebarHeader>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">EvidenceQ</p>
          <p className="text-sm text-zinc-700 dark:text-zinc-200">Consultant workspace</p>
        </SidebarHeader>
        <SidebarBody>
          <SidebarSection>
        {items.map((item) => {
          const isActive = activeHref === item.href || activeHref.startsWith(`${item.href}/`);

          return (
            <CatalystSidebarItem current={isActive} href={item.href} key={item.href}>
              <SidebarLabel>{item.label}</SidebarLabel>
              {item.badge ? (
                <Badge className={cn('ml-auto')} color="zinc">
                  {item.badge}
                </Badge>
              ) : null}
            </CatalystSidebarItem>
          );
        })}
          </SidebarSection>
        </SidebarBody>
      </CatalystSidebar>
    </aside>
  );
}
