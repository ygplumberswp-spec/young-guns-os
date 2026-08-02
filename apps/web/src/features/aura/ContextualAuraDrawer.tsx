import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'wouter';
import { AI_NAME } from '@titan/shared';
import { Button } from '@titan/ui';
import { AuraMark } from '../../brand/AuraMark';
import { AuraComposer } from './AuraComposer';
import { AuraMessageList } from './AuraMessageList';
import { resolveAuraSuggestions } from './aura-page-suggestions';
import { useContextualAura } from './contextual-aura-context';
import { useAuraChat } from './useAuraChat';

export function ContextualAuraDrawer() {
  const { isOpen, closeDrawer, pageContext, draftPrompt, setDraftPrompt } = useContextualAura();
  const pendingPromptRef = useRef<string | null>(null);

  const chatContext = useMemo(
    () => ({
      customerId: pageContext.customerId,
      jobId: pageContext.jobId,
      vehicleId: pageContext.vehicleId,
      schedulingView: pageContext.module === 'scheduling',
      quoteId: pageContext.quoteId,
      invoiceId: pageContext.invoiceId,
      recordType: pageContext.recordType,
      recordId: pageContext.recordId,
      financeDraft: pageContext.financeDraft,
    }),
    [
      pageContext.customerId,
      pageContext.financeDraft,
      pageContext.invoiceId,
      pageContext.jobId,
      pageContext.module,
      pageContext.quoteId,
      pageContext.recordId,
      pageContext.recordType,
      pageContext.vehicleId,
    ],
  );

  const {
    messages,
    isSending,
    thinkingPhase,
    thinkingElapsedMs,
    workingLabel,
    error,
    sendMessage,
    cancelSend,
    startConversation,
  } = useAuraChat(chatContext);

  const suggestions = useMemo(
    () => pageContext.auraSuggestions ?? resolveAuraSuggestions(pageContext.module),
    [pageContext.auraSuggestions, pageContext.module],
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
    if (!isOpen || !pendingPromptRef.current) return;
    const prompt = pendingPromptRef.current;
    pendingPromptRef.current = null;
    void (async () => {
      await startConversation();
      await sendMessage(prompt);
    })();
  }, [isOpen, sendMessage, startConversation]);

  if (!isOpen) return null;

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    await startConversation();
    await sendMessage(trimmed);
  }

  return (
    <>
      <button
        type="button"
        className="contextual-aura-backdrop"
        aria-label="Close AURA drawer"
        onClick={closeDrawer}
      />
      <aside className="contextual-aura-drawer" aria-label={`${AI_NAME} assistant`}>
        <header className="contextual-aura-drawer__header">
          <div className="contextual-aura-drawer__title">
            <AuraMark size="sm" />
            <div>
              <strong>{AI_NAME}</strong>
              <p className="contextual-aura-drawer__context">
                {pageContext.pageTitle ?? pageContext.module} · {pageContext.route}
              </p>
            </div>
          </div>
          <div className="contextual-aura-drawer__header-actions">
            <Link href="/aura" className="contextual-aura-drawer__link">
              Open full chat
            </Link>
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
          <AuraMessageList
            messages={messages}
            isSending={isSending}
            thinkingPhase={thinkingPhase}
            thinkingElapsedMs={thinkingElapsedMs}
            hasPageContext
          />
          {error ? <p className="form-error">{error}</p> : null}
        </div>

        <footer className="contextual-aura-drawer__composer">
          <AuraComposer
            onSend={handleSend}
            onCancel={cancelSend}
            isWorking={isSending}
            workingLabel={workingLabel}
            placeholder={`Ask ${AI_NAME} about this page…`}
          />
          <p className="contextual-aura-drawer__disclaimer">
            Recommendations show evidence and confidence. Financial actions require approval.
          </p>
        </footer>
      </aside>
    </>
  );
}
