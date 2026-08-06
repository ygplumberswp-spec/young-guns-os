import { Link } from 'wouter';
import { Panel } from '@titan/ui';
import { AuraComposer } from '../aura/AuraComposer';
import { AuraMessageList } from '../aura/AuraMessageList';
import { useAuraChat } from '../aura/useAuraChat';

function AuraGlyph() {
  return (
    <span className="exec-aura-chat__glyph" aria-hidden="true">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
        <circle cx="12" cy="12" r="3.2" />
      </svg>
    </span>
  );
}

/**
 * Owner's executive chat. The conversation loads on its own clock so a slow or failed
 * AURA read never holds up the rest of the dashboard.
 */
export function AuraExecutiveChatPanel() {
  const {
    messages,
    isLoading,
    isSending,
    thinkingPhase,
    thinkingElapsedMs,
    hasPageContext,
    workingLabel,
    error,
    sendMessage,
    cancelSend,
  } = useAuraChat();

  return (
    <Panel
      title="AURA Executive Chat"
      description="Live AI assistant"
      headerAction={<Link href="/aura">Open full AURA chat</Link>}
    >
      <div className="exec-aura-chat">
        <p className="exec-aura-chat__intro">
          <AuraGlyph />
          <span>Answers come from this company&apos;s live TITAN records.</span>
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        {isLoading ? (
          <p className="page-muted">Loading AURA conversations…</p>
        ) : (
          <AuraMessageList
            messages={messages}
            isSending={isSending}
            thinkingPhase={thinkingPhase}
            thinkingElapsedMs={thinkingElapsedMs}
            hasPageContext={hasPageContext}
          />
        )}
        <AuraComposer
          onSend={sendMessage}
          onCancel={cancelSend}
          disabled={isLoading}
          isWorking={isSending}
          workingLabel={workingLabel || 'Thinking…'}
          placeholder="Ask AURA about your business…"
        />
      </div>
    </Panel>
  );
}
