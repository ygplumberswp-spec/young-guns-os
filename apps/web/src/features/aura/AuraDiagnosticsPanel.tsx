import { useState } from 'react';
import type { AuraSendDiagnostics } from '@titan/shared';

type AuraDiagnosticsPanelProps = {
  diagnostics: AuraSendDiagnostics | null;
};

/** Technical timing logs — collapsed by default. */
export function AuraDiagnosticsPanel({ diagnostics }: AuraDiagnosticsPanelProps) {
  const [open, setOpen] = useState(false);

  if (!diagnostics) {
    return null;
  }

  const rows = [
    ['Total', `${diagnostics.totalApiMs} ms`],
    ['Provider', `${diagnostics.providerMs} ms`],
    ['Context build', `${diagnostics.contextBuildMs} ms`],
    ['Database', `${diagnostics.databaseMs} ms`],
    ['Domains loaded', diagnostics.contextDomainsLoaded.join(', ') || '—'],
    ['Domains skipped', diagnostics.contextDomainsSkipped.join(', ') || '—'],
    ['Provider attempts', String(diagnostics.providerAttempts)],
    ['Retries', String(diagnostics.retryCount)],
  ];

  return (
    <details
      className="aura-diagnostics"
      open={open}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
    >
      <summary className="aura-diagnostics__summary">Technical details</summary>
      <dl className="aura-diagnostics__grid">
        {rows.map(([label, value]) => (
          <div key={label} className="aura-diagnostics__row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
