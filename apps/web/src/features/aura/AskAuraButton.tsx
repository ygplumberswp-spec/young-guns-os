import { Button } from '@titan/ui';
import { UI_VOCABULARY } from '@titan/shared';
import { useOptionalContextualAura } from './contextual-aura-context';

type AskAuraButtonProps = {
  className?: string;
  size?: 'sm' | 'md';
};

export function AskAuraButton({ className = '', size = 'sm' }: AskAuraButtonProps) {
  const aura = useOptionalContextualAura();
  if (!aura) return null;

  return (
    <Button
      variant="secondary"
      size={size}
      className={`ask-aura-btn ${className}`.trim()}
      onClick={() => aura.openDrawer()}
      title="Ask AURA (⌘⇧A)"
    >
      {UI_VOCABULARY.askAura}
    </Button>
  );
}
