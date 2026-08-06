import { Link } from 'wouter';
import { useState } from 'react';
import { Button, Panel } from '@titan/ui';
import { useAuraChat } from '../aura/useAuraChat';

/**
 * Compact AURA entry point — full chat opens on its own route.
 */
export function AuraExecutiveChatLauncher() {
  const [draft, setDraft] = useState('');
  const { sendMessage, isSending, isLoading, error } = useAuraChat();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSending || isLoading) return;
    void sendMessage(message).then(() => setDraft(''));
  };

  return (
    <Panel
      title="AURA"
      description="Executive assistant"
      className="exec-aura-launcher-panel"
      headerAction={<Link href="/aura">Open full AURA Chat</Link>}
    >
      <div className="exec-aura-launcher">
        <p className="exec-aura-launcher__intro">
          Ask AURA about jobs, cash, quotes and priorities. Answers use this company&apos;s live
          records only.
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <form className="exec-aura-launcher__form" onSubmit={handleSubmit}>
          <input
            type="text"
            className="exec-aura-launcher__input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask AURA about your business…"
            disabled={isLoading || isSending}
            aria-label="Ask AURA"
          />
          <Button type="submit" size="sm" disabled={isLoading || isSending || !draft.trim()}>
            {isSending ? 'Sending…' : 'Ask'}
          </Button>
        </form>
        <Link href="/aura" className="exec-aura-launcher__full-link">
          Open full AURA Chat
        </Link>
      </div>
    </Panel>
  );
}
