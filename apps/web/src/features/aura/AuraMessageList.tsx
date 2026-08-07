import { useEffect, useRef } from 'react';
import type { AuraMessage } from '@titan/shared';
import { AI_NAME } from '@titan/shared';
import { AuraMark } from '../../brand/AuraMark';
import { AuraMessageContent } from './AuraMessageContent';
import type { AuraThinkingPhase } from './aura-thinking';
import { resolveAuraThinkingLabel } from './aura-thinking';

type AuraMessageListProps = {
  messages: AuraMessage[];
  isSending: boolean;
  thinkingPhase?: AuraThinkingPhase;
  thinkingElapsedMs?: number;
  hasPageContext?: boolean;
};

export function AuraMessageList({
  messages,
  isSending,
  thinkingPhase = 'idle',
  thinkingElapsedMs = 0,
  hasPageContext = false,
}: AuraMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending, thinkingPhase]);

  if (messages.length === 0) {
    return (
      <div className="aura-empty-chat">
        <AuraMark size="lg" className="aura-empty-chat__mark" />
        <h3 className="aura-empty-chat__title">AURA Executive Chat</h3>
        <p className="aura-empty-chat__description">
          Ask AURA anything about your TITAN workspace. Responses are powered by your configured AI
          provider and stored securely per company and user.
        </p>
      </div>
    );
  }

  const thinkingLabel = isSending
    ? resolveAuraThinkingLabel(thinkingPhase, thinkingElapsedMs, hasPageContext)
    : '';

  return (
    <div className="aura-messages">
      {messages.map((message) => (
        <article key={message.id} className={`aura-message aura-message--${message.role}`}>
          <div className="aura-message__meta">
            {message.role === 'assistant' ? (
              <>
                <AuraMark size="sm" className="aura-message__mark" />
                <span>{AI_NAME}</span>
              </>
            ) : (
              'You'
            )}
          </div>
          <div className="aura-message__bubble">
            <AuraMessageContent content={message.content} role={message.role} />
          </div>
        </article>
      ))}
      {isSending ? (
        <article className="aura-message aura-message--assistant">
          <div className="aura-message__meta">
            <AuraMark size="sm" className="aura-message__mark" />
            <span>{AI_NAME}</span>
          </div>
          <div className="aura-message__bubble aura-message__bubble--typing">
            {thinkingLabel || 'Thinking…'}
          </div>
        </article>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}
