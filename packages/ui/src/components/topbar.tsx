import type { ReactNode } from 'react';

import { Heading } from '../catalyst/heading';
import { Navbar, NavbarSection, NavbarSpacer } from '../catalyst/navbar';
import { Text } from '../catalyst/text';

export type TopbarProps = {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
};

export function Topbar({ title, subtitle, rightSlot }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-950/10 bg-white/90 px-6 py-3 backdrop-blur-sm dark:border-white/10 dark:bg-zinc-900/90">
      <Navbar>
        <NavbarSection className="min-w-0">
          <div className="min-w-0">
            <Heading className="truncate text-xl/7 sm:text-lg/7" level={1}>
              {title}
            </Heading>
            {subtitle ? (
              <Text className="truncate text-sm/5 text-zinc-500 dark:text-zinc-400">{subtitle}</Text>
            ) : null}
          </div>
        </NavbarSection>
        <NavbarSpacer />
        {rightSlot ? <NavbarSection>{rightSlot}</NavbarSection> : null}
      </Navbar>
    </header>
  );
}
