import type { ReactNode } from 'react';
import { Button, type ButtonProps } from '@titan/ui';

type PrimaryActionProps = Omit<ButtonProps, 'variant'> & {
  children: ReactNode;
};

/** Premium primary CTA — bright accent on dark surfaces. */
export function PrimaryAction({ children, className = '', ...props }: PrimaryActionProps) {
  return (
    <Button variant="primary" className={`ux-primary-action ${className}`.trim()} {...props}>
      {children}
    </Button>
  );
}
