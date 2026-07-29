import { useEffect, useRef } from 'react';
import type { AuraMessage } from '@titan/shared';
import { AI_NAME } from '@titan/shared';

type AuraMessageListProps = {
  messages: AuraMessage[];
  isSending: boolean;
};

export function AuraMessageList({ messages, isSending }: AuraMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  if (messages.length === 0) {
    return (
      <div className="aura-empty-chat">
        <div className="aura-empty-chat__badge">{AI_NAME}</div>
        <h3 className="aura-empty-chat__title">Your central AI assistant</h3>
        <p className="aura-empty-chat__description">
          Ask AURA anything about your TITAN workspace. Responses are powered by your configured AI
          provider and stored securely per company and user.
        </p>
      </div>
    );
  }

  return (
    <div className="aura-messages">
      {messages.map((message) => (
        <article
          key={message.id}
          className={`aura-message aura-message--${message.role}`}
        >
          <div className="aura-message__meta">
            {message.role === 'assistant' ? AI_NAME : 'You'}
          </div>
          <div className="aura-message__bubble">{message.content}</div>
        </article>
      ))}
      {isSending ? (
        <article className="aura-message aura-message--assistant">
          <div className="aura-message__meta">{AI_NAME}</div>
          <div className="aura-message__bubble aura-message__bubble--typing">Thinking...</div>
        </article>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}
