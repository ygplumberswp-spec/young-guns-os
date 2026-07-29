import { FormEvent, useEffect, useState } from 'react';
import { Button, Input, PageHeader } from '@titan/ui';
import type { AiTone, CompanyProfile } from '@titan/shared';
import { AI_TONE_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCompanyProfile, updateCompanyProfile } from '../../lib/company-api';
import { useAuth } from '../../lib/auth-context';

export function CompanySettingsPage() {
  const { accessToken, user } = useAuth();
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [timezone, setTimezone] = useState('');
  const [currency, setCurrency] = useState('');
  const [locale, setLocale] = useState('');
  const [aiTone, setAiTone] = useState<AiTone>('professional');
  const [notes, setNotes] = useState('');

  const canEdit = user?.permissions.includes('*') ?? false;

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchCompanyProfile(accessToken);

        if (cancelled) {
          return;
        }

        setProfile(data);
        setName(data.name);
        setIndustry(data.industry ?? '');
        setBusinessType(data.businessType ?? '');
        setTimezone(data.preferences.timezone ?? '');
        setCurrency(data.preferences.currency ?? '');
        setLocale(data.preferences.locale ?? '');
        setAiTone(data.preferences.aiTone ?? 'professional');
        setNotes(data.preferences.notes ?? '');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load company profile');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !canEdit) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateCompanyProfile(accessToken, {
        name,
        industry: industry.trim() || null,
        businessType: businessType.trim() || null,
        preferences: {
          timezone: timezone.trim() || undefined,
          currency: currency.trim() || undefined,
          locale: locale.trim() || undefined,
          aiTone,
          notes: notes.trim() || undefined,
        },
      });

      setProfile(updated);
      setSuccess('Company profile saved. AURA will use this context in future conversations.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save company profile');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <div className="settings-loading">Loading company settings...</div>;
  }

  return (
    <>
      <PageHeader
        title="Company Profile"
        description="Business information used by AURA to understand your workspace. No demo data — fill in your real company details."
      />

      {error ? <p className="settings-alert settings-alert--error">{error}</p> : null}
      {success ? <p className="settings-alert settings-alert--success">{success}</p> : null}

      <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
        <section className="settings-section">
          <h2 className="settings-section__title">Business information</h2>
          <div className="settings-grid">
            <Input
              label="Company name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!canEdit}
              required
            />
            <Input
              label="Industry"
              name="industry"
              placeholder="e.g. Plumbing, Consulting, Retail"
              value={industry}
              onChange={(event) => setIndustry(event.target.value)}
              disabled={!canEdit}
            />
            <Input
              label="Business type"
              name="businessType"
              placeholder="e.g. Service, SaaS, Agency"
              value={businessType}
              onChange={(event) => setBusinessType(event.target.value)}
              disabled={!canEdit}
            />
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section__title">Preferences</h2>
          <div className="settings-grid">
            <Input
              label="Timezone"
              name="timezone"
              placeholder="e.g. America/New_York"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              disabled={!canEdit}
            />
            <Input
              label="Currency"
              name="currency"
              placeholder="e.g. USD"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              disabled={!canEdit}
            />
            <Input
              label="Locale"
              name="locale"
              placeholder="e.g. en-US"
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              disabled={!canEdit}
            />
          </div>

          <label className="settings-field">
            <span className="settings-field__label">AURA tone</span>
            <select
              className="settings-select"
              value={aiTone}
              onChange={(event) => setAiTone(event.target.value as AiTone)}
              disabled={!canEdit}
            >
              {AI_TONE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span className="settings-field__label">Notes for AURA</span>
            <textarea
              className="settings-textarea"
              name="notes"
              placeholder="Describe how your business operates, services offered, or guidance for AURA."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={!canEdit}
              rows={4}
            />
          </label>
        </section>

        {profile ? (
          <p className="settings-meta">
            Company ID: {profile.id} · Last updated {new Date(profile.updatedAt).toLocaleString()}
          </p>
        ) : null}

        {canEdit ? (
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save company profile'}
          </Button>
        ) : (
          <p className="settings-readonly">You can view this profile but need owner access to edit.</p>
        )}
      </form>
    </>
  );
}
