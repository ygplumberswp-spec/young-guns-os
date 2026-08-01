import { useState } from 'react';
import { Button } from '@titan/ui';

export type BulkCommunicationRecipient = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
};

type BulkCommunicationsReviewProps = {
  open: boolean;
  channel: 'email' | 'whatsapp';
  recipients: BulkCommunicationRecipient[];
  onClose: () => void;
  onConfirmDrafts: (message: string) => void;
};

/** Review screen before bulk Email/WhatsApp — never sends immediately. */
export function BulkCommunicationsReview({
  open,
  channel,
  recipients,
  onClose,
  onConfirmDrafts,
}: BulkCommunicationsReviewProps) {
  const [message, setMessage] = useState('');

  if (!open) return null;

  const channelLabel = channel === 'email' ? 'Email' : 'WhatsApp';

  return (
    <div className="ux-confirm-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ux-confirm-dialog ux-bulk-review"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="ux-confirm-dialog__title">Review bulk {channelLabel}</h2>
        <p className="ux-confirm-dialog__body">
          {recipients.length} recipient{recipients.length === 1 ? '' : 's'} selected. Messages are
          saved as drafts for review — nothing is sent automatically.
        </p>
        <ul className="ux-bulk-review__list">
          {recipients.slice(0, 12).map((recipient) => (
            <li key={recipient.id}>
              <strong>{recipient.name}</strong>
              <span className="muted-text">
                {channel === 'email'
                  ? recipient.email ?? 'No email'
                  : recipient.phone ?? 'No phone'}
              </span>
            </li>
          ))}
          {recipients.length > 12 ? (
            <li className="muted-text">+ {recipients.length - 12} more</li>
          ) : null}
        </ul>
        <label className="titan-input-group">
          <span className="titan-input-label">Draft message</span>
          <textarea
            className="titan-input crm-textarea"
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={`Write a ${channelLabel} draft for review…`}
          />
        </label>
        <div className="ux-confirm-dialog__actions">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!message.trim()}
            onClick={() => {
              onConfirmDrafts(message.trim());
              setMessage('');
            }}
          >
            Create drafts for review
          </Button>
        </div>
      </div>
    </div>
  );
}
