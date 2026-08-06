import type { ReactNode } from 'react';

type FinanceEditorCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  id?: string;
};

export function FinanceEditorCard({
  title,
  description,
  children,
  className,
  id,
}: FinanceEditorCardProps) {
  return (
    <section
      id={id}
      className={['finance-editor-card', className].filter(Boolean).join(' ')}
      aria-labelledby={id ? `${id}-title` : undefined}
    >
      <header className="finance-editor-card__header">
        <h2 className="finance-editor-card__title" id={id ? `${id}-title` : undefined}>
          {title}
        </h2>
        {description ? <p className="finance-editor-card__description">{description}</p> : null}
      </header>
      <div className="finance-editor-card__body">{children}</div>
    </section>
  );
}
