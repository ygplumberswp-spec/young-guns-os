import { Link } from 'wouter';
import type {
  ExecutiveSectionStatus,
  ExecutiveXeroFinance,
  FinancialTruthSummary,
} from '@titan/shared';
import { Panel } from '@titan/ui';
import { useCompanyLocale } from '../../lib/company-locale-context';
import { DashboardSectionSkeleton } from './DashboardSectionSkeleton';
import { DashboardSourceMeta } from './DashboardSourceMeta';
import { resolveFinanceCardHonesty, resolveSectionHonesty } from './dashboard-honesty';

type FinancialTruthPanelProps = {
  data: FinancialTruthSummary | null;
  xeroFinance?: ExecutiveXeroFinance | null;
  section?: ExecutiveSectionStatus | null;
  generatedAt?: string | null;
  isLoading?: boolean;
  error?: string | null;
};

export function FinancialTruthPanel({
  data,
  xeroFinance = null,
  section = null,
  generatedAt = null,
  isLoading = false,
  error = null,
}: FinancialTruthPanelProps) {
  const { formatMoney } = useCompanyLocale();
  const sectionHonesty = resolveSectionHonesty(section, error);
  const financeHonesty = resolveFinanceCardHonesty(xeroFinance, error);
  const lines = data?.currentMonth ?? [];
  const currency = data?.currency ?? 'ZAR';

  return (
    <Panel
      title="Financial Truth"
      description="Invoiced revenue, collected cash and debtors"
      className="exec-financial-truth-panel"
    >
      <div className="exec-financial-truth">
        {isLoading ? (
          <DashboardSectionSkeleton rows={4} />
        ) : (
          <>
            <ul className="exec-financial-truth__lines">
              {lines.map((line) => (
                <li key={line.key} className="exec-financial-truth__line">
                  {line.href ? (
                    <Link href={line.href} className="exec-financial-truth__link">
                      <span className="exec-financial-truth__label">
                        {line.label}
                        {line.estimate ? (
                          <em className="exec-financial-truth__estimate"> (estimate)</em>
                        ) : null}
                      </span>
                      <span className="exec-financial-truth__amount">
                        {line.estimate && line.amountCents === 0
                          ? '—'
                          : formatMoney(line.amountCents, currency)}
                      </span>
                    </Link>
                  ) : (
                    <>
                      <span className="exec-financial-truth__label">{line.label}</span>
                      <span className="exec-financial-truth__amount">
                        {formatMoney(line.amountCents, currency)}
                      </span>
                    </>
                  )}
                  <span className="exec-financial-truth__caption">{line.caption}</span>
                </li>
              ))}
            </ul>
            {data?.previousMonthComparison.length ? (
              <div className="exec-financial-truth__comparison">
                <p className="exec-financial-truth__comparison-title">Previous month</p>
                {data.previousMonthComparison.map((line) => (
                  <p key={line.key} className="exec-financial-truth__comparison-row">
                    <span>{line.label}</span>
                    <span>
                      {line.estimate ? '—' : formatMoney(line.amountCents, currency)}
                    </span>
                  </p>
                ))}
              </div>
            ) : null}
            {data?.accountingNotes.length ? (
              <ul className="exec-financial-truth__notes">
                {data.accountingNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
            {data?.yocoPaidSeparateFromReconciled ? (
              <p className="exec-financial-truth__yoco-note">
                Yoco payment confirmation is separate from Xero reconciliation.
              </p>
            ) : null}
          </>
        )}
        <DashboardSourceMeta
          source={section?.source ?? 'Finance · Xero'}
          updatedAt={section?.updatedAt ?? generatedAt}
          state={financeHonesty.state !== 'live' ? financeHonesty.state : sectionHonesty.state}
          note={data?.freshness ?? financeHonesty.note ?? sectionHonesty.note}
          href="/integrations/xero"
          linkLabel="Manage Xero"
        />
      </div>
    </Panel>
  );
}
