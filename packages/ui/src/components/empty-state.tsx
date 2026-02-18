import type { ReactNode } from 'react';

import { Heading } from '../catalyst/heading';
import { Text } from '../catalyst/text';
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
    <div className="rounded-2xl border border-dashed border-zinc-950/15 bg-zinc-50 p-8 text-center dark:border-white/20 dark:bg-zinc-950">
      {icon ? <div className="mb-3 flex justify-center text-zinc-500 dark:text-zinc-400">{icon}</div> : null}
      <Heading className="text-base/7 sm:text-base/7" level={3}>
        {title}
      </Heading>
      <Text className="mt-2 text-sm/6">{description}</Text>
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
