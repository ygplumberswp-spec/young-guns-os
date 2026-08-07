import { Link } from 'wouter';
import type {
  ExecutiveSectionStatus,
  ExecutiveXeroFinance,
  FinancialTruthSummary,
} from '@titan/shared';
import { Panel } from '@titan/ui';
import { DashboardDetailsDisclosure } from './DashboardDetailsDisclosure';
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

const PRIMARY_KEYS = ['invoiced', 'collected', 'outstanding', 'overdue', 'gross_profit'] as const;

export function FinancialTruthPanel({
  data,
  xeroFinance = null,
  section = null,
  generatedAt = null,
  isLoading = false,
  error = null,
}: FinancialTruthPanelProps) {
  const sectionHonesty = resolveSectionHonesty(section, error);
  const financeHonesty = resolveFinanceCardHonesty(xeroFinance, error);
  const lines = data?.currentMonth ?? [];
  const primaryLines = PRIMARY_KEYS.map((key) => lines.find((line) => line.key === key)).filter(
    (line): line is NonNullable<typeof line> => line != null,
  );
  const previous = data?.previousMonthComparison[0] ?? null;
  const partialImport =
    data?.freshness === 'Some earlier records are still being imported' ||
    financeHonesty.state === 'partial';

  return (
    <Panel title="Financial Truth" description="Invoiced revenue, collected cash and debtors">
      <div className="exec-financial-truth">
        {isLoading ? (
          <DashboardSectionSkeleton rows={3} />
        ) : (
          <>
            <div className="exec-financial-truth__summary-grid">
              {primaryLines.map((line) => (
                <div key={line.key} className="exec-financial-truth__summary-card">
                  {line.href ? (
                    <Link href={line.href} className="exec-financial-truth__summary-link">
                      <span className="exec-financial-truth__summary-label">
                        {line.label}
                        {line.estimate ? (
                          <em className="exec-financial-truth__estimate"> (estimate)</em>
                        ) : null}
                      </span>
                      <span className="exec-financial-truth__summary-value">{line.displayValue}</span>
                    </Link>
                  ) : (
                    <>
                      <span className="exec-financial-truth__summary-label">{line.label}</span>
                      <span className="exec-financial-truth__summary-value">{line.displayValue}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
            {previous ? (
              <div className="exec-financial-truth__comparison">
                <span className="exec-financial-truth__comparison-label">{previous.label}</span>
                <span className="exec-financial-truth__comparison-value">{previous.displayValue}</span>
              </div>
            ) : null}
            {partialImport ? (
              <p className="exec-financial-truth__import-note">
                Some earlier financial records are still being imported.
              </p>
            ) : null}
          </>
        )}
        <DashboardDetailsDisclosure>
          <DashboardSourceMeta
            source={section?.source ?? 'Finance · Xero'}
            updatedAt={section?.updatedAt ?? generatedAt}
            state={financeHonesty.state === 'partial' ? 'live' : financeHonesty.state}
            note={financeHonesty.note ?? sectionHonesty.note}
            href="/integrations/xero"
            linkLabel="Manage Xero"
          />
        </DashboardDetailsDisclosure>
      </div>
    </Panel>
  );
}
