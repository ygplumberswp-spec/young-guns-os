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
  const credit =
    attribution === 'built'
      ? 'Built by Young Guns Plumbing'
      : 'Created by Young Guns Plumbing';

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
        <p className="auth-stage__credit">{credit}</p>
      </div>
    </div>
  );
}
