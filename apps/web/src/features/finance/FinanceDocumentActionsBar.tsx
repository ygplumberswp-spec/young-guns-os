import { Button } from '@titan/ui';

export type FinanceDocumentAction =
  | 'save'
  | 'save_draft'
  | 'save_new'
  | 'preview_pdf'
  | 'approve'
  | 'send';

type FinanceDocumentActionsBarProps = {
  isSaving?: boolean;
  canApprove?: boolean;
  canSend?: boolean;
  approveLabel?: string;
  onAction: (action: FinanceDocumentAction) => void;
};

export function FinanceDocumentActionsBar({
  isSaving,
  canApprove,
  canSend,
  approveLabel = 'Approve',
  onAction,
}: FinanceDocumentActionsBarProps) {
  return (
    <div className="finance-document-actions">
      <div className="finance-document-actions__primary">
        <Button
          type="button"
          disabled={isSaving}
          title="Save the document with its current valid status. New documents remain draft until approved."
          onClick={() => onAction('save')}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isSaving}
          title="Explicitly save as Draft — does not issue, approve or send."
          onClick={() => onAction('save_draft')}
        >
          Save Draft
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isSaving}
          title="Save this document, then open a clean new editor."
          onClick={() => onAction('save_new')}
        >
          Save &amp; New
        </Button>
        <Button type="button" variant="secondary" disabled={isSaving} onClick={() => onAction('preview_pdf')}>
          Preview PDF
        </Button>
      </div>
      <div className="finance-document-actions__secondary">
        {canApprove ? (
          <Button type="button" variant="outline" disabled={isSaving} onClick={() => onAction('approve')}>
            {approveLabel}
          </Button>
        ) : null}
        {canSend ? (
          <Button type="button" disabled={isSaving} onClick={() => onAction('send')}>
            Send
          </Button>
        ) : null}
      </div>
    </div>
  );
}
