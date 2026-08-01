import { EmptyState, Panel } from '@titan/ui';
import { PageHeader } from '../../components/ux';
import { FinanceNav } from './FinanceNav';

type FinancePhaseHoldPageProps = {
  title: string;
  phase: string;
  description: string;
  blockedReason: string;
};

export function FinancePhaseHoldPage({
  title,
  phase,
  description,
  blockedReason,
}: FinancePhaseHoldPageProps) {
  return (
    <div className="finance-page owner-page-content">
      <FinanceNav />
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={[
          { label: 'Finance', href: '/finance/quotes' },
          { label: title, href: '#' },
        ]}
      />
      <Panel title={title} className="owner-page-content__section">
        <EmptyState
          title={`${title} — ${phase}`}
          description={`${blockedReason} This page shows an honest coming-soon state with no placeholder financial data.`}
        />
      </Panel>
    </div>
  );
}
