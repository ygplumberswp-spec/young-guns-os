import type { ReactNode } from 'react';

type AppContentContainerProps = {
  children: ReactNode;
  /** Use 1280px cap instead of default 1400px. */
  narrow?: boolean;
  /** Remove max-width cap (rare full-bleed owner views). */
  wide?: boolean;
  className?: string;
};

export function AppContentContainer({
  children,
  narrow = false,
  wide = false,
  className,
}: AppContentContainerProps) {
  const variantClass = wide
    ? 'app-content-container--wide'
    : narrow
      ? 'app-content-container--narrow'
      : '';

  return (
    <div className={`app-content-container ${variantClass} ${className ?? ''}`.trim()}>
      {children}
    </div>
  );
}
