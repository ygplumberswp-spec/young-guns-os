import { type HTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';

export type LayoutProps = HTMLAttributes<HTMLDivElement> & {
  header?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
};

export function AppShell({ header, sidebar, children, className, ...props }: LayoutProps) {
  return (
    <div className={clsx('titan-shell', className)} {...props}>
      {header ? <header className="titan-shell__header">{header}</header> : null}
      <div className="titan-shell__body">
        {sidebar ? <aside className="titan-shell__sidebar">{sidebar}</aside> : null}
        <main className="titan-shell__main">{children}</main>
      </div>
    </div>
  );
}

export type PageHeaderProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions, className, ...props }: PageHeaderProps) {
  return (
    <div className={clsx('titan-page-header', className)} {...props}>
      <div>
        <h1 className="titan-page-header__title">{title}</h1>
        {description ? <p className="titan-page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="titan-page-header__actions">{actions}</div> : null}
    </div>
  );
}

export type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
};

export function EmptyState({ title, description, action, icon, className, ...props }: EmptyStateProps) {
  return (
    <div className={clsx('titan-empty-state', className)} {...props}>
      {icon ? <div className="titan-empty-state__icon">{icon}</div> : null}
      <h2 className="titan-empty-state__title">{title}</h2>
      <p className="titan-empty-state__description">{description}</p>
      {action ? <div className="titan-empty-state__action">{action}</div> : null}
    </div>
  );
}
