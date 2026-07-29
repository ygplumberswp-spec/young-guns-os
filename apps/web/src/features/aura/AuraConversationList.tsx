import type { AuraConversationSummary } from '@titan/shared';
import { Button } from '@titan/ui';

type AuraConversationListProps = {
  conversations: AuraConversationSummary[];
  activeConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onCreate: () => void;
  onDelete: (conversationId: string) => void;
};

export function AuraConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  onDelete,
}: AuraConversationListProps) {
  return (
    <aside className="aura-sidebar">
      <div className="aura-sidebar__header">
        <h2 className="aura-sidebar__title">Conversations</h2>
        <Button size="sm" onClick={onCreate}>
          New
        </Button>
      </div>
      <div className="aura-sidebar__list">
        {conversations.length === 0 ? (
          <p className="aura-sidebar__empty">No conversations yet. Start one to talk with AURA.</p>
        ) : (
          conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`aura-sidebar__item ${
                conversation.id === activeConversationId ? 'aura-sidebar__item--active' : ''
              }`}
            >
              <button
                type="button"
                className="aura-sidebar__item-button"
                onClick={() => onSelect(conversation.id)}
              >
                <span className="aura-sidebar__item-title">{conversation.title}</span>
                <span className="aura-sidebar__item-meta">
                  {conversation.messageCount} message{conversation.messageCount === 1 ? '' : 's'}
                </span>
              </button>
              <button
                type="button"
                className="aura-sidebar__delete"
                aria-label="Delete conversation"
                onClick={() => onDelete(conversation.id)}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
