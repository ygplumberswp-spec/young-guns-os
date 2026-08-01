import type { ReactNode } from 'react';
import { useLocation } from 'wouter';
import { PageHeader as TitanPageHeader } from '@titan/ui';
import { shouldShowBackButton } from '../../lib/back-navigation';
import { Breadcrumbs, type BreadcrumbItem } from './Breadcrumbs';
import { BackButton } from './BackButton';

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
  /** Override auto-detected back visibility. `true` forces show; `false` hides. */
  showBack?: boolean;
  backFallbackHref?: string;
  backLabel?: string;
  onBackNavigate?: () => void;
  /** Unsaved-changes guard wrapper for back navigation. */
  guardNavigation?: (action: () => void) => void;
};

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
  showBack,
  backFallbackHref,
  backLabel,
  onBackNavigate,
  guardNavigation,
}: PageHeaderProps) {
  const [location] = useLocation();
  const resolvedShowBack = showBack ?? shouldShowBackButton(location);

  return (
    <header className={`ux-page-header ${className ?? ''}`.trim()}>
      {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="ux-page-header__row">
        {resolvedShowBack ? (
          <BackButton
            fallbackHref={backFallbackHref}
            label={backLabel}
            onNavigate={onBackNavigate}
            guardNavigation={guardNavigation}
          />
        ) : null}
        <div className="ux-page-header__main">
          <TitanPageHeader title={title} description={description} actions={actions} />
        </div>
      </div>
    </header>
  );
}
