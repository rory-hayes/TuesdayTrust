import type { MouseEventHandler, ReactNode } from 'react';

import { Button as CatalystButton } from '../catalyst/button';
import { cn } from '../lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md';

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  className?: string;
  type?: 'button' | 'submit' | 'reset' | undefined;
  disabled?: boolean | undefined;
  onClick?: MouseEventHandler<HTMLButtonElement> | undefined;
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm/6',
  md: 'px-4 py-2 text-sm/6'
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  children,
  disabled,
  onClick
}: ButtonProps) {
  const eventProps = {
    ...(typeof disabled === 'boolean' ? { disabled } : {}),
    ...(onClick ? { onClick } : {}),
    ...(type ? { type } : {})
  };

  if (variant === 'secondary') {
    return (
      <CatalystButton className={cn(sizeClasses[size], className)} outline {...eventProps}>
        {children}
      </CatalystButton>
    );
  }

  if (variant === 'ghost') {
    return (
      <CatalystButton className={cn(sizeClasses[size], className)} plain {...eventProps}>
        {children}
      </CatalystButton>
    );
  }

  return (
    <CatalystButton className={cn(sizeClasses[size], className)} color="blue" {...eventProps}>
      {children}
    </CatalystButton>
  );
}
