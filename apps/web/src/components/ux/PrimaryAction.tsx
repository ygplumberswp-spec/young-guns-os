import { Button, type ButtonProps } from '@titan/ui';

export type PrimaryActionProps = ButtonProps;

export function PrimaryAction({ className, variant = 'primary', ...props }: PrimaryActionProps) {
  return (
    <Button
      variant={variant}
      className={`ux-primary-action ${className ?? ''}`.trim()}
      {...props}
    />
  );
}
