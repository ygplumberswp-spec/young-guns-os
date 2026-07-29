import { useEffect, useState } from 'react';
import { Button, EmptyState, PageHeader, Panel } from '@titan/ui';
import type { CxLoyaltyReferralSummary } from '@titan/shared';
import { PortalApiClientError, createCxPortalReferral, fetchCxPortalReferrals } from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';

export function PortalLoyaltyPage() {
  const { accessToken } = usePortalAuth();
  const [referrals, setReferrals] = useState<CxLoyaltyReferralSummary[]>([]);
  const [referredEmail, setReferredEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void fetchCxPortalReferrals(accessToken)
      .then(setReferrals)
      .catch((err) => setError(err instanceof PortalApiClientError ? err.message : 'Unable to load referrals'));
  }, [accessToken]);

  async function inviteReferral() {
    if (!accessToken || !referredEmail.trim()) return;
    try {
      const referral = await createCxPortalReferral(accessToken, referredEmail.trim());
      setReferrals((current) => [referral, ...current]);
      setReferredEmail('');
      setSuccess('Referral invitation recorded');
    } catch (err) {
      setError(err instanceof PortalApiClientError ? err.message : 'Unable to create referral');
    }
  }

  return (
    <div className="portal-page">
      <PageHeader title="Loyalty & referrals" description="Invite friends and track referral rewards." />
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Panel title="Invite someone">
        <div className="form-row">
          <input
            type="email"
            placeholder="Email address"
            value={referredEmail}
            onChange={(event) => setReferredEmail(event.target.value)}
          />
          <Button onClick={() => void inviteReferral()}>Send invitation</Button>
        </div>
      </Panel>

      <Panel title="Your referrals">
        {referrals.length === 0 ? (
          <EmptyState title="No referrals yet" description="Referral invitations you send will appear here." />
        ) : (
          <ul className="portal-list">
            {referrals.map((referral) => (
              <li key={referral.id}>
                <strong>{referral.referredEmail}</strong>
                <span>{referral.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
