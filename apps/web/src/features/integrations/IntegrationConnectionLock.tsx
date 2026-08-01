import { FormEvent, useEffect, useRef, useState } from 'react';
import { Button, Input, Panel } from '@titan/ui';
import type { IntegrationConnectionStatus } from '@titan/shared';
import { formatConnectionStatus } from './formatters';

type ConnectionField = {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'email' | 'number';
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
};

type IntegrationConnectionLockProps = {
  providerName: string;
  status: IntegrationConnectionStatus;
  isConnected: boolean;
  canManage: boolean;
  isOwner: boolean;
  isBusy?: boolean;
  error?: string | null;
  success?: string | null;
  statusRows: Array<{ label: string; value: string }>;
  connectFields: ConnectionField[];
  connectValues: Record<string, string>;
  onConnectValueChange: (key: string, value: string) => void;
  onConnect: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onDisconnect: () => void | Promise<void>;
  onReplaceCredentials?: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onVerifyStored?: () => void | Promise<void>;
  connectHelpText?: string;
  recoveryContent?: React.ReactNode;
};

export function IntegrationConnectionLock({
  providerName,
  status,
  isConnected,
  canManage,
  isOwner,
  isBusy = false,
  error,
  success,
  statusRows,
  connectFields,
  connectValues,
  onConnectValueChange,
  onConnect,
  onDisconnect,
  onReplaceCredentials,
  onVerifyStored,
  connectHelpText,
  recoveryContent,
}: IntegrationConnectionLockProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showConnectedCard = isConnected || status === 'error';

  return (
    <>
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Panel title="Connection">
        {showConnectedCard ? (
          <div className="integration-connection-lock">
            <dl className="integration-status-list">
              <div>
                <dt>Status</dt>
                <dd>{formatConnectionStatus(status)}</dd>
              </div>
              {statusRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>

            {canManage ? (
              <div className="integration-connection-lock__menu-wrap" ref={menuRef}>
                <button
                  type="button"
                  className="integration-connection-lock__menu-trigger"
                  aria-label={`${providerName} connection actions`}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  ⋯
                </button>
                {menuOpen ? (
                  <div className="integration-connection-lock__menu">
                    {onVerifyStored ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          void onVerifyStored();
                        }}
                        disabled={isBusy}
                      >
                        Reconnect
                      </button>
                    ) : null}
                    {isOwner && onReplaceCredentials ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setReplaceMode(true);
                          setConfirmReplace(false);
                        }}
                        disabled={isBusy}
                      >
                        Replace credentials
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        if (!confirmDisconnect) {
                          setConfirmDisconnect(true);
                          return;
                        }
                        void onDisconnect();
                      }}
                      disabled={isBusy}
                    >
                      {confirmDisconnect ? 'Confirm disconnect' : 'Disconnect'}
                    </button>
                    {confirmDisconnect ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDisconnect(false)}
                        disabled={isBusy}
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : canManage ? (
          <form
            className="settings-form"
            onSubmit={(event) => void onConnect(event)}
            autoComplete="off"
          >
            {connectFields.map((field) => (
              <Input
                key={field.key}
                label={field.label}
                type={field.type ?? 'text'}
                value={connectValues[field.key] ?? ''}
                onChange={(event) => onConnectValueChange(field.key, event.target.value)}
                autoComplete={field.autoComplete ?? 'off'}
                required={field.required ?? true}
                placeholder={field.placeholder}
              />
            ))}
            {connectHelpText ? <p className="page-muted">{connectHelpText}</p> : null}
            <div className="integration-actions">
              <Button type="submit" disabled={isBusy}>
                {isBusy ? 'Connecting…' : 'Connect'}
              </Button>
            </div>
          </form>
        ) : (
          <p className="page-muted">Not connected.</p>
        )}
      </Panel>

      {replaceMode && isOwner && onReplaceCredentials ? (
        <Panel title={`Replace ${providerName} credentials`}>
          <p className="page-muted">
            Enter new credentials below. TITAN validates them against the live provider before
            saving. Your existing connection stays active if validation fails.
          </p>
          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!confirmReplace) {
                setConfirmReplace(true);
                return;
              }
              void onReplaceCredentials(event);
            }}
            autoComplete="off"
          >
            {connectFields.map((field) => (
              <Input
                key={`replace-${field.key}`}
                label={field.label}
                type={field.type ?? 'text'}
                value={connectValues[field.key] ?? ''}
                onChange={(event) => onConnectValueChange(field.key, event.target.value)}
                autoComplete={field.autoComplete ?? 'off'}
                required={field.required ?? true}
                placeholder={field.placeholder}
              />
            ))}
            <div className="integration-actions">
              <Button type="submit" disabled={isBusy}>
                {isBusy
                  ? 'Validating…'
                  : confirmReplace
                    ? 'Confirm replace credentials'
                    : 'Validate & replace credentials'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={isBusy}
                onClick={() => {
                  setReplaceMode(false);
                  setConfirmReplace(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      {recoveryContent ? (
        <Panel title="Recovery controls">
          <p className="page-muted">
            Manual sync and diagnostics are recovery-only. Background sync runs automatically when
            connected.
          </p>
          {recoveryContent}
        </Panel>
      ) : null}
    </>
  );
}
