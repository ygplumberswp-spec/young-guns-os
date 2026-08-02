import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { PageHeader as TitanPageHeader } from '@titan/ui';
import { shouldShowBackButton } from '../../lib/back-navigation';
import { AskAuraButton } from '../../features/aura/AskAuraButton';
import { useOptionalContextualAura } from '../../features/aura/contextual-aura-context';
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
  /** Show contextual Ask AURA button (default true on staff pages). */
  showAura?: boolean;
  auraRecordId?: string;
  auraRecordType?: string;
  auraCustomerId?: string;
  auraJobId?: string;
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
  showAura = true,
  auraRecordId,
  auraRecordType,
  auraCustomerId,
  auraJobId,
}: PageHeaderProps) {
  const [location] = useLocation();
  const resolvedShowBack = showBack ?? shouldShowBackButton(location);
  const aura = useOptionalContextualAura();

  useEffect(() => {
    if (!aura || !showAura) return;
    aura.setPageContext({
      pageTitle: title,
      recordId: auraRecordId,
      recordType: auraRecordType,
      customerId: auraCustomerId,
      jobId: auraJobId,
    });
  }, [
    aura,
    auraCustomerId,
    auraJobId,
    auraRecordId,
    auraRecordType,
    showAura,
    title,
  ]);

  const headerActions = (
    <div className="ux-page-header__actions">
      {actions}
      {showAura ? <AskAuraButton /> : null}
    </div>
  );

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
          <TitanPageHeader title={title} description={description} actions={headerActions} />
        </div>
      </div>
    </header>
  );
}
