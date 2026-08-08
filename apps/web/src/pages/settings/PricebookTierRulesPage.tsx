import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '../../components/ux';
import { Button, Input, LoadingState, Panel } from '@titan/ui';
import type { PricebookRuleSet, PricebookResolveResult } from '@titan/shared';
import { YOUNG_GUNS_DRAFT_TIER_FORMULA } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchPricebookBulkImpact,
  fetchPricebookRuleSet,
  previewPricebookBaseCost,
  savePricebookRuleDraft,
} from '../../lib/finance-api';
import { useAuth } from '../../lib/auth-context';
import { SettingsNav } from '../../features/settings/SettingsNav';

function centsToRandInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function randInputToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function PricebookTierRulesPage() {
  const { accessToken, user } = useAuth();
  const [ruleSet, setRuleSet] = useState<PricebookRuleSet | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewRand, setPreviewRand] = useState('400.00');
  const [previewResult, setPreviewResult] = useState<PricebookResolveResult | null>(null);
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  const [bulkCount, setBulkCount] = useState<number | null>(null);

  const canEdit =
    user?.roleName === 'Company Owner' ||
    user?.roleName === 'Owner' ||
    (user?.permissions.includes('*') ?? false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchPricebookRuleSet(accessToken);
        if (cancelled) return;
        setRuleSet(data.ruleSet);
        setPersisted(data.persisted);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Failed to load pricebook rules');
          setRuleSet({
            id: 'local-draft',
            companyId: user?.companyId ?? '',
            ...YOUNG_GUNS_DRAFT_TIER_FORMULA,
            globalAutomationEnabled: false,
            status: 'DRAFT',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, user?.companyId]);

  async function onSaveDraft(e: FormEvent) {
    e.preventDefault();
    if (!accessToken || !ruleSet || !canEdit) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await savePricebookRuleDraft(accessToken, {
        name: ruleSet.name,
        baseCostType: ruleSet.baseCostType,
        status: ruleSet.status === 'INACTIVE' ? 'INACTIVE' : 'DRAFT',
        tiers: ruleSet.tiers,
      });
      setRuleSet(data.ruleSet);
      setPersisted(true);
      setSuccess(
        data.unchanged
          ? 'Draft unchanged (idempotent save). Global automatic pricing is OFF.'
          : 'Draft saved. Global automatic pricing is OFF. Not applied to catalogue.',
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  }

  async function onPreview() {
    if (!accessToken) return;
    setError(null);
    try {
      const cents = randInputToCents(previewRand);
      const data = await previewPricebookBaseCost(accessToken, {
        baseCostCents: cents,
        isDiscountedNet: true,
        costSource: 'owner_preview_fixture',
      });
      setPreviewResult(data.result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Preview failed');
    }
  }

  async function onBulkPreview() {
    if (!accessToken) return;
    setError(null);
    try {
      const data = await fetchPricebookBulkImpact(accessToken);
      setBulkCount(data.catalogueRowCount);
      setBulkNote(`${data.note} · applied=${data.applied}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Bulk preview failed');
    }
  }

  if (loading && !ruleSet) {
    return <LoadingState label="Loading pricebook tier rules…" />;
  }

  return (
    <>
      <PageHeader
        title="Pricebook Tier Rules"
        description="Configurable sell-price multipliers. Draft / inactive only — not applied to catalogue."
      />
      <SettingsNav />

      <Panel title="Global automatic pricing is OFF">
        <p className="page-muted">
          Row 92 implements a versioned, tenant-scoped tier formula for configuration and preview.
          Real Young Guns catalogue prices are not changed. Activation requires a later Owner
          authorisation path (not available here).
        </p>
        <p>
          Status: <strong>{ruleSet?.status ?? 'DRAFT'}</strong>
          {persisted ? '' : ' (unsaved template)'} · Version: {ruleSet?.version ?? 1} · Base cost
          type: {ruleSet?.baseCostType}
        </p>
      </Panel>

      <Panel title="Tier multipliers">
        <ul>
          {(ruleSet?.tiers ?? YOUNG_GUNS_DRAFT_TIER_FORMULA.tiers).map((tier) => (
            <li key={`${tier.minCentsInclusive}-${tier.label}`}>
              {tier.label} ({centsToRandInput(tier.minCentsInclusive)}
              {tier.maxCentsInclusive == null
                ? '+'
                : ` – ${centsToRandInput(tier.maxCentsInclusive)}`}
              )
            </li>
          ))}
        </ul>
        <p className="page-muted">
          Values are multipliers (e.g. 2.2x), not “220% markup”. Customers never see these internals.
        </p>
        {canEdit ? (
          <form onSubmit={onSaveDraft}>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save draft'}
            </Button>
          </form>
        ) : (
          <p className="page-muted">Owner configuration only — view access.</p>
        )}
        {success ? <p>{success}</p> : null}
        {error ? <p role="alert">{error}</p> : null}
      </Panel>

      <Panel title="Owner preview (fixture — not saved to catalogue)">
        <label>
          Base cost (R)
          <Input value={previewRand} onChange={(e) => setPreviewRand(e.target.value)} />
        </label>
        <Button type="button" onClick={onPreview}>
          Preview sell price
        </Button>
        {previewResult?.ok ? (
          <div>
            <p>Base cost: R{centsToRandInput(previewResult.baseCostCents)}</p>
            <p>Matched tier: {previewResult.matchedTierLabel}</p>
            <p>Multiplier: {previewResult.multiplierDisplay}</p>
            <p>Calculated result: R{centsToRandInput(previewResult.sellPriceExVatCents)} ex VAT</p>
            <p>
              Rule v{previewResult.ruleVersion} · {previewResult.ruleStatus} · activation{' '}
              {previewResult.activationStatus}
            </p>
            <p className="page-muted">{previewResult.explanation}</p>
          </div>
        ) : null}
        {previewResult && !previewResult.ok ? (
          <p role="alert">
            {previewResult.code}: {previewResult.message}
          </p>
        ) : null}
      </Panel>

      <Panel title="Bulk impact preview (read-only)">
        <Button type="button" onClick={onBulkPreview}>
          Run catalogue impact preview
        </Button>
        {bulkCount != null ? <p>Catalogue rows considered: {bulkCount}</p> : null}
        {bulkNote ? <p className="page-muted">{bulkNote}</p> : null}
        <p className="page-muted">Applied catalogue price changes: 0 (always for Row 92).</p>
      </Panel>

      <Panel title="Activation">
        <p className="page-muted">
          Activation is blocked: PRICEBOOK_RULE_OWNER_CONFIRMATION_REQUIRED. This page does not
          offer a live activate control.
        </p>
      </Panel>
    </>
  );
}
