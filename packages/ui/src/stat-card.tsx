import { type HTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';

export type StatCardProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
};

export function StatCard({ label, value, hint, icon, className, ...props }: StatCardProps) {
  return (
    <div className={clsx('titan-stat-card', className)} {...props}>
      <div className="titan-stat-card__header">
        <span className="titan-stat-card__label">{label}</span>
        {icon ? <span className="titan-stat-card__icon">{icon}</span> : null}
      </div>
      <p className="titan-stat-card__value">{value}</p>
      {hint ? <p className="titan-stat-card__hint">{hint}</p> : null}
    </div>
  );
}

export type PanelProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  description?: string;
  /** Trailing control in the header — typically a "View all" link. */
  headerAction?: ReactNode;
  children: ReactNode;
};

export function Panel({
  title,
  description,
  headerAction,
  children,
  className,
  ...props
}: PanelProps) {
  return (
    <section className={clsx('titan-panel', className)} {...props}>
      <div className="titan-panel__header">
        <div className="titan-panel__heading">
          <h2 className="titan-panel__title">{title}</h2>
          {description ? <p className="titan-panel__description">{description}</p> : null}
        </div>
        {headerAction ? <div className="titan-panel__action">{headerAction}</div> : null}
      </div>
      <div className="titan-panel__body">{children}</div>
    </section>
  );
}
