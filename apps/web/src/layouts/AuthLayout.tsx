import { type ReactNode } from 'react';
import { AI_NAME, APP_NAME } from '@titan/shared';

type AuthLayoutProps = {
  children: ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        backgroundColor: '#f8fafc',
      }}
    >
      <div style={{ width: '100%', maxWidth: '24rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 className="brand" style={{ fontSize: '1.5rem' }}>
            {APP_NAME}
          </h1>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>
            Powered by {AI_NAME} AI
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
