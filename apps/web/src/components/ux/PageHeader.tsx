import type { ReactNode } from 'react';
import { PageHeader as TitanPageHeader } from '@titan/ui';
import { Breadcrumbs, type BreadcrumbItem } from './Breadcrumbs';

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
};

export function PageHeader({ title, description, actions, breadcrumbs, className }: PageHeaderProps) {
  return (
    <header className={`ux-page-header ${className ?? ''}`.trim()}>
      {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
      <TitanPageHeader title={title} description={description} actions={actions} />
    </header>
  );
}
