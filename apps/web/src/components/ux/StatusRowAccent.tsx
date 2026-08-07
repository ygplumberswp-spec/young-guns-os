import type { ReactNode } from 'react';
import type { StatusColorTone } from '@titan/shared';

type StatusRowAccentProps = {
  tone: StatusColorTone;
  children: ReactNode;
  className?: string;
  as?: 'tr' | 'div';
};

/** Subtle left border and background tint keyed to entity status. */
export function StatusRowAccent({
  tone,
  children,
  className = '',
  as: Tag = 'tr',
}: StatusRowAccentProps) {
  return (
    <Tag className={`ux-status-row ux-status-row--${tone} ${className}`.trim()}>{children}</Tag>
  );
}
