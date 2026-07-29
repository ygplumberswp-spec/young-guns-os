import { FormEvent, useState } from 'react';
import { Button } from '@titan/ui';

type AuraComposerProps = {
  onSend: (content: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
};

export function AuraComposer({ onSend, disabled, placeholder = 'Message AURA...' }: AuraComposerProps) {
  const [content, setContent] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = content.trim();

    if (!trimmed || disabled) {
      return;
    }

    setContent('');
    await onSend(trimmed);
  }

  return (
    <form className="aura-composer" onSubmit={(event) => void handleSubmit(event)}>
      <textarea
        className="aura-composer__input"
        placeholder={placeholder}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={3}
        disabled={disabled}
      />
      <div className="aura-composer__actions">
        <Button type="submit" disabled={disabled || !content.trim()}>
          Send
        </Button>
      </div>
    </form>
  );
}
