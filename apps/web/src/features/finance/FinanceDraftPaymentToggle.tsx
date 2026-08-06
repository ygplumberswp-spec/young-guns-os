import { canManageFinance } from './utils';

type Props = {
  isOwner: boolean;
  canWrite: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
  status: string;
};

export function FinanceDraftPaymentToggle({ isOwner, canWrite, checked, onChange, status }: Props) {
  if (status !== 'draft' || !canWrite) return null;

  return (
    <label className="finance-editor-field-group finance-draft-payment-toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={!isOwner}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        Show payment details in this preview
        {!isOwner ? ' (Owner only on draft invoices)' : ''}
      </span>
      <p className="finance-editor-hint">
        Draft invoice previews hide bank details by default. Enable this preview-only override when you
        need to share payment instructions before sending.
      </p>
    </label>
  );
}

export function canUseDraftPaymentPreview(user: { permissions: readonly string[]; roleName: string | null } | null): boolean {
  return Boolean(user && canManageFinance(user.permissions));
}

export function isFinanceDocumentOwner(user: { roleName: string | null } | null): boolean {
  return user?.roleName === 'Company Owner';
}
