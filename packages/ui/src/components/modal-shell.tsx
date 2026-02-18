import type { ReactNode } from 'react';

import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogTitle
} from '../catalyst/dialog';
import { cn } from '../lib/cn';

export type ModalShellProps = {
  children: ReactNode;
  title: string;
  description?: string;
  isOpen: boolean;
  className?: string;
  onClose?: () => void;
};

export function ModalShell({
  children,
  title,
  description,
  isOpen,
  className,
  onClose
}: ModalShellProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <Dialog className={cn(className)} onClose={onClose ?? (() => undefined)} open={isOpen} size="xl">
      <DialogTitle>{title}</DialogTitle>
      {description ? <DialogDescription>{description}</DialogDescription> : null}
      <DialogBody>{children}</DialogBody>
    </Dialog>
  );
}
