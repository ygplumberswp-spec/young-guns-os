import { useEffect, useMemo, useRef } from 'react';
import { AI_NAME } from '@titan/shared';
import { Button } from '@titan/ui';
import { AuraMark } from '../../brand/AuraMark';
import { AuraComposer } from './AuraComposer';
import { usePortalAuth } from '../../lib/portal-auth-context';
import { useContextualAura } from './contextual-aura-context';
import {
  inferPortalAuraModuleFromPath,
  resolvePortalAuraSuggestions,
  toPortalAuraRoute,
} from './portal-aura-suggestions';
import { usePortalAuraChat } from './usePortalAuraChat';

function PortalAuraMessageList({
  messages,
  isSending,
}: {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  isSending: boolean;
}) {
  if (messages.length === 0 && !isSending) {
    return (
      <p className="muted-text contextual-aura-drawer__empty">
        Ask about your jobs, quotes, invoices, documents or appointments. AURA only sees your own
        records.
      </p>
    );
  }

  return (
    <ul className="aura-message-list">
      {messages.map((message, index) => (
        <li
          key={`${message.role}-${index}`}
          className={`aura-message aura-message--${message.role}`}
        >
          <p>{message.content}</p>
        </li>
      ))}
      {isSending ? (
        <li className="aura-message aura-message--assistant">
          <p className="muted-text">Thinking…</p>
        </li>
      ) : null}
    </ul>
  );
}

export function PortalContextualAuraDrawer() {
  const { isOpen, closeDrawer, pageContext, draftPrompt, setDraftPrompt } = useContextualAura();
  const { accessToken, user } = usePortalAuth();
  const pendingPromptRef = useRef<string | null>(null);

  const portalRoute = toPortalAuraRoute(pageContext.route);
  const portalModule = inferPortalAuraModuleFromPath(portalRoute);

  const chatContext = useMemo(
    () => ({
      route: portalRoute,
      module: portalModule,
      recordType: pageContext.recordType,
      recordId: pageContext.recordId,
      customerId: user?.customerId ?? pageContext.customerId,
      jobId: pageContext.jobId,
    }),
    [
      pageContext.jobId,
      pageContext.recordId,
      pageContext.recordType,
      pageContext.customerId,
      portalModule,
      portalRoute,
      user?.customerId,
    ],
  );

  const { messages, isSending, error, sendMessage, cancelSend } = usePortalAuraChat(chatContext);

  const suggestions = useMemo(
    () => resolvePortalAuraSuggestions(portalModule),
    [portalModule],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('contextual-aura-open');
    return () => document.body.classList.remove('contextual-aura-open');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !draftPrompt.trim()) return;
    pendingPromptRef.current = draftPrompt.trim();
    setDraftPrompt('');
  }, [draftPrompt, isOpen, setDraftPrompt]);

  useEffect(() => {
    if (!isOpen || !pendingPromptRef.current || !accessToken) return;
    const prompt = pendingPromptRef.current;
    pendingPromptRef.current = null;
    void sendMessage(accessToken, prompt);
  }, [accessToken, isOpen, sendMessage]);

  if (!isOpen) return null;

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !accessToken) return;
    await sendMessage(accessToken, trimmed);
  }

  const contextLabel =
    pageContext.pageTitle ??
    (portalModule === 'portal_dashboard' ? 'Customer portal' : portalModule.replace('portal_', ''));

  return (
    <>
      <button
        type="button"
        className="contextual-aura-backdrop"
        aria-label="Close AURA drawer"
        onClick={closeDrawer}
      />
      <aside className="contextual-aura-drawer" aria-label={`${AI_NAME} customer assistant`}>
        <header className="contextual-aura-drawer__header">
          <div className="contextual-aura-drawer__title">
            <AuraMark size="sm" />
            <div>
              <strong>{AI_NAME}</strong>
              <p className="contextual-aura-drawer__context">
                {contextLabel} · {portalRoute} · Client
              </p>
            </div>
          </div>
          <div className="contextual-aura-drawer__header-actions">
            <Button variant="ghost" size="sm" onClick={closeDrawer}>
              Close
            </Button>
          </div>
        </header>

        <div className="contextual-aura-drawer__chips" role="group" aria-label="Suggested prompts">
          {suggestions.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="contextual-aura-drawer__chip"
              onClick={() => void handleSend(chip.prompt)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="contextual-aura-drawer__messages">
          <PortalAuraMessageList messages={messages} isSending={isSending} />
          {error ? <p className="form-error">{error}</p> : null}
        </div>

        <footer className="contextual-aura-drawer__composer">
          <AuraComposer
            onSend={handleSend}
            onCancel={cancelSend}
            isWorking={isSending}
            workingLabel="Thinking…"
            placeholder={`Ask ${AI_NAME} about your account…`}
          />
          <p className="contextual-aura-drawer__disclaimer">
            Client view only — no internal costs, staff data or other customers. Safe actions are
            logged.
          </p>
        </footer>
      </aside>
    </>
  );
}
