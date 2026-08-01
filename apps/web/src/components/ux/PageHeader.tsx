import type { ReactNode } from 'react';
import { PageHeader as TitanPageHeader } from '@titan/ui';
import { Breadcrumbs, type BreadcrumbItem } from './Breadcrumbs';
import { BackButton } from './BackButton';

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
  /** Show smart back control top-left */
  showBack?: boolean;
  backFallbackHref?: string;
  backLabel?: string;
  onBackNavigate?: () => void;
};

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
  showBack = false,
  backFallbackHref,
  backLabel,
  onBackNavigate,
}: PageHeaderProps) {
  return (
    <header className={`ux-page-header ${className ?? ''}`.trim()}>
      {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="ux-page-header__row">
        {showBack ? (
          <BackButton
            fallbackHref={backFallbackHref}
            label={backLabel}
            onNavigate={onBackNavigate}
          />
        ) : null}
        <div className="ux-page-header__main">
          <TitanPageHeader title={title} description={description} actions={actions} />
        </div>
      </div>
    </header>
  );
}
