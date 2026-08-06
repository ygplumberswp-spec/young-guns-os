import { FormEvent, useRef, useState } from 'react';
import { Button } from '@titan/ui';

type AuraComposerProps = {
  onSend: (content: string) => void | Promise<void>;
  onCancel?: () => void;
  disabled?: boolean;
  isWorking?: boolean;
  workingLabel?: string;
  placeholder?: string;
};

export function AuraComposer({
  onSend,
  onCancel,
  disabled,
  isWorking = false,
  workingLabel = 'AURA is thinking…',
  placeholder = 'Message AURA...',
}: AuraComposerProps) {
  const [content, setContent] = useState('');
  const submittingRef = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = content.trim();

    if (!trimmed || disabled || isWorking || submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setContent('');

    try {
      await onSend(trimmed);
    } finally {
      submittingRef.current = false;
    }
  }

  const sendDisabled = disabled || isWorking || !content.trim();

  return (
    <form className="aura-composer" onSubmit={(event) => void handleSubmit(event)}>
      {isWorking ? <p className="aura-composer__status">{workingLabel}</p> : null}
      <textarea
        className="aura-composer__input"
        placeholder={placeholder}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={3}
        disabled={disabled}
        aria-busy={isWorking}
      />
      <div className="aura-composer__actions">
        {isWorking && onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={sendDisabled}>
          Send
        </Button>
      </div>
    </form>
  );
}
