import { type ReactNode } from 'react';
import { AI_NAME } from '@titan/shared';
import { TitanWordmark } from '../brand/TitanWordmark';
import { StagingBadge } from '../components/StagingBadge';

type AuthLayoutProps = {
  children: ReactNode;
  /** Optional banner above the card (session expired, success, etc.) */
  banner?: ReactNode;
  attribution?: 'created' | 'built';
};

export function AuthLayout({
  children,
  banner,
  attribution = 'created',
}: AuthLayoutProps) {
  const creditPrefix = attribution === 'built' ? 'Built by' : 'Created by';

  return (
    <div className="auth-stage">
      <div className="auth-stage__glow" aria-hidden="true" />
      <div className="auth-stage__inner">
        <header className="auth-stage__brand">
          <TitanWordmark variant="hero" className="auth-stage__wordmark" />
          <p className="auth-stage__powered">
            Powered by <span className="auth-stage__powered-accent">{AI_NAME}</span>
          </p>
          <StagingBadge />
        </header>
        {banner}
        <div className="auth-stage__card">{children}</div>
        <p className="auth-stage__credit">
          <span className="brand-credit__by">{creditPrefix}</span>{' '}
          <span className="brand-credit__org">Young Guns Plumbing</span>
        </p>
      </div>
    </div>
  );
}
