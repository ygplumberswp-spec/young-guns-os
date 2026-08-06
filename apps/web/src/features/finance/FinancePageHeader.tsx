import { Link, useLocation } from 'wouter';
import { Button } from '@titan/ui';
import { PageHeader, PrimaryAction } from '../../components/ux';

type FinanceSection = 'quotes' | 'boq' | 'invoices' | 'payments';

const FINANCE_DESCRIPTION = 'Quotes, invoices, BOQs and payment records for your company.';

function resolveSection(path: string): FinanceSection {
  if (path.startsWith('/finance/boq')) return 'boq';
  if (path.startsWith('/finance/invoices')) return 'invoices';
  if (path.startsWith('/finance/payments')) return 'payments';
  return 'quotes';
}

type FinancePageHeaderProps = {
  canWrite?: boolean;
  usePrimaryAction?: boolean;
};

export function FinancePageHeader({ canWrite = false, usePrimaryAction = false }: FinancePageHeaderProps) {
  const [location] = useLocation();
  const section = resolveSection(location);

  const action =
    canWrite && section === 'quotes' ? (
      usePrimaryAction ? (
        <Link href="/finance/quotes/new">
          <PrimaryAction>New quote</PrimaryAction>
        </Link>
      ) : (
        <Link href="/finance/quotes/new">
          <Button>New Quote</Button>
        </Link>
      )
    ) : canWrite && section === 'boq' ? (
      <Link href="/finance/boq/new">
        <Button>New BOQ</Button>
      </Link>
    ) : canWrite && section === 'invoices' ? (
      <Link href="/finance/invoices/new">
        <PrimaryAction>New invoice</PrimaryAction>
      </Link>
    ) : canWrite && section === 'payments' ? (
      <Link href="/finance/payments/new">
        <Button>Record Payment</Button>
      </Link>
    ) : undefined;

  return (
    <PageHeader title="Finance" description={FINANCE_DESCRIPTION} actions={action} />
  );
}
