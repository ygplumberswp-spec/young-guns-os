import type { ReactNode } from 'react';

export type StatusBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'sync';

type StatusBadgeProps = {
  label: string;
  tone?: StatusBadgeTone;
  icon?: ReactNode;
  className?: string;
};

export function StatusBadge({ label, tone = 'neutral', icon, className = '' }: StatusBadgeProps) {
  return (
    <span className={`ux-status-badge ux-status-badge--${tone} ${className}`.trim()}>
      {icon ? <span className="ux-status-badge__icon">{icon}</span> : null}
      {label}
    </span>
  );
}
