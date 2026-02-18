import type { ComponentPropsWithoutRef } from 'react';

import { Input as CatalystInput } from '../catalyst/input';
import { cn } from '../lib/cn';

type InputProps = ComponentPropsWithoutRef<typeof CatalystInput>;

export function Input({ className, ...props }: InputProps) {
  return <CatalystInput className={cn(className)} {...props} />;
}
