import { useCompanyLocale } from '../lib/company-locale-context';

/** Visible on every staff page when the signed-in tenant is the QA audit sandbox. */
export function AuditSandboxBanner() {
  const { auditSandboxBanner } = useCompanyLocale();

  if (!auditSandboxBanner) return null;

  return (
    <div className="audit-sandbox-banner" role="status" aria-live="polite">
      {auditSandboxBanner}
    </div>
  );
}
