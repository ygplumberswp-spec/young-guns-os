import type { ReactNode } from 'react';

type FinanceEditorActionsProps = {
  children: ReactNode;
};

export function FinanceEditorActions({ children }: FinanceEditorActionsProps) {
  return <div className="finance-editor__actions">{children}</div>;
}
