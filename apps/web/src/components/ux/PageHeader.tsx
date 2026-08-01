import { type ReactNode } from 'react';
import { PageHeader as UiPageHeader, type PageHeaderProps } from '@titan/ui';

export type UxPageHeaderProps = PageHeaderProps & {
  breadcrumbs?: ReactNode;
};

export function PageHeader({ breadcrumbs, className, ...props }: UxPageHeaderProps) {
  return (
    <div className={`ux-page-header ${className ?? ''}`.trim()}>
      {breadcrumbs}
      <UiPageHeader {...props} />
    </div>
  );
}
