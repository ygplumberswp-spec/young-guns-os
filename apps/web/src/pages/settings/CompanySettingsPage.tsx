import { FormEvent, useEffect, useRef, useState } from 'react';
import { Button, Input, LoadingState, PageHeader } from '@titan/ui';
import type { AiTone, CocApplicability, CompanyProfile } from '@titan/shared';
import {
  AI_TONE_OPTIONS,
  CAPE_TOWN_DEFAULT_LOCALE,
  CAPE_TOWN_DEFAULT_TIMEZONE,
  DEFAULT_YG_COC_SETTINGS,
  DEFAULT_YG_SERVICE_GEOGRAPHY,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  fetchCompanyMediaStatus,
  fetchCompanyProfile,
  removeCompanyMedia,
  updateCompanyProfile,
  uploadCompanyMedia,
} from '../../lib/company-api';
import { getCachedCompanyProfile } from '../../lib/company-profile-cache';
import { useCachedQuery } from '../../lib/use-cached-query';
import { CompanyMediaImage } from '../../features/company/CompanyMediaImage';
import { useAuth } from '../../lib/auth-context';

export function CompanySettingsPage() {
  const { accessToken, user } = useAuth();
  const [profile, setProfile] = useState<CompanyProfile | null>(() =>
    accessToken ? getCachedCompanyProfile(accessToken) : null,
  );
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
  const [tradingName, setTradingName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerJobTitle, setOwnerJobTitle] = useState('');
  const [companyTelephone, setCompanyTelephone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [postalAddress, setPostalAddress] = useState('');
  const [companyRegistrationNumber, setCompanyRegistrationNumber] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [servicesOffered, setServicesOffered] = useState('');
  const [operatingHours, setOperatingHours] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [brandPrimaryColor, setBrandPrimaryColor] = useState('');
  const [brandAccentColor, setBrandAccentColor] = useState('');
  const [serviceCity, setServiceCity] = useState(DEFAULT_YG_SERVICE_GEOGRAPHY.primaryCity);
  const [serviceProvince, setServiceProvince] = useState(
    DEFAULT_YG_SERVICE_GEOGRAPHY.primaryProvince,
  );
  const [serviceSuburbsText, setServiceSuburbsText] = useState(
    DEFAULT_YG_SERVICE_GEOGRAPHY.serviceSuburbs.join('\n'),
  );
  const [outsideAreaPolicy, setOutsideAreaPolicy] = useState<
    'quote_travel' | 'decline' | 'manual_review'
  >(DEFAULT_YG_SERVICE_GEOGRAPHY.outsideAreaPolicy);
  const [geographyNotes, setGeographyNotes] = useState(
    DEFAULT_YG_SERVICE_GEOGRAPHY.notes ?? '',
  );
  const [cocDefault, setCocDefault] = useState<CocApplicability>(
    DEFAULT_YG_COC_SETTINGS.defaultApplicability,
  );
  const [gasRequiresCoc, setGasRequiresCoc] = useState(DEFAULT_YG_COC_SETTINGS.gasWorkRequiresCoc);
  const [electricalRequiresCoc, setElectricalRequiresCoc] = useState(
    DEFAULT_YG_COC_SETTINGS.electricalWorkRequiresCoc,
  );
  const [sansNote, setSansNote] = useState(DEFAULT_YG_COC_SETTINGS.sansReferenceNote);
  const [cocDocumentLabel, setCocDocumentLabel] = useState(DEFAULT_YG_COC_SETTINGS.documentLabel);
  const [mediaConfigured, setMediaConfigured] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const profileImageInputRef = useRef<HTMLInputElement>(null);

  const canEdit = user?.permissions.includes('*') ?? false;

  function applyProfileToForm(data: CompanyProfile) {
    setProfile(data);
    setName(data.name);
    setIndustry(data.industry ?? '');
    setBusinessType(data.businessType ?? '');
    setTimezone(data.preferences.timezone ?? CAPE_TOWN_DEFAULT_TIMEZONE);
    setCurrency(data.preferences.currency ?? 'ZAR');
    setLocale(data.preferences.locale ?? CAPE_TOWN_DEFAULT_LOCALE);
    setAiTone(data.preferences.aiTone ?? 'professional');
    setNotes(data.preferences.notes ?? '');
    setTradingName(data.preferences.tradingName ?? '');
    setOwnerName(data.preferences.ownerName ?? '');
    setOwnerJobTitle(data.preferences.ownerJobTitle ?? '');
    setCompanyTelephone(data.preferences.companyTelephone ?? '');
    setCompanyEmail(data.preferences.companyEmail ?? '');
    setWebsite(data.preferences.website ?? '');
    setPhysicalAddress(data.preferences.physicalAddress ?? '');
    setPostalAddress(data.preferences.postalAddress ?? '');
    setCompanyRegistrationNumber(data.preferences.companyRegistrationNumber ?? '');
    setVatNumber(data.preferences.vatNumber ?? '');
    setBusinessDescription(data.preferences.businessDescription ?? '');
    setServicesOffered(data.preferences.servicesOffered ?? '');
    setOperatingHours(data.preferences.operatingHours ?? '');
    setEmergencyContactName(data.preferences.emergencyContactName ?? '');
    setEmergencyContactPhone(data.preferences.emergencyContactPhone ?? '');
    setBrandPrimaryColor(data.preferences.brandPrimaryColor ?? '');
    setBrandAccentColor(data.preferences.brandAccentColor ?? '');
    const geo = data.preferences.serviceGeography ?? DEFAULT_YG_SERVICE_GEOGRAPHY;
    setServiceCity(geo.primaryCity);
    setServiceProvince(geo.primaryProvince);
    setServiceSuburbsText(geo.serviceSuburbs.join('\n'));
    setOutsideAreaPolicy(geo.outsideAreaPolicy);
    setGeographyNotes(geo.notes ?? '');
    const coc = data.preferences.cocSettings ?? DEFAULT_YG_COC_SETTINGS;
    setCocDefault(coc.defaultApplicability);
    setGasRequiresCoc(coc.gasWorkRequiresCoc);
    setElectricalRequiresCoc(coc.electricalWorkRequiresCoc);
    setSansNote(coc.sansReferenceNote);
    setCocDocumentLabel(coc.documentLabel);
  }

  const {
    data: loadedProfile,
    error: profileError,
    isLoading,
  } = useCachedQuery({
    queryKey: 'company/profile',
    accessToken,
    enabled: Boolean(accessToken),
    staleTimeMs: 120_000,
    fetcher: async () => fetchCompanyProfile(accessToken!),
  });

  const { data: mediaStatus } = useCachedQuery({
    queryKey: 'company/media-status',
    accessToken,
    enabled: Boolean(accessToken),
    staleTimeMs: 120_000,
    fetcher: async () => fetchCompanyMediaStatus(accessToken!),
  });

  useEffect(() => {
    if (loadedProfile) {
      applyProfileToForm(loadedProfile);
    }
  }, [loadedProfile]);

  useEffect(() => {
    if (mediaStatus) {
      setMediaConfigured(mediaStatus.configured);
    }
  }, [mediaStatus]);

  useEffect(() => {
    if (profileError) {
      setError(profileError);
    }
  }, [profileError]);

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
          tradingName: tradingName.trim() || undefined,
          ownerName: ownerName.trim() || undefined,
          ownerJobTitle: ownerJobTitle.trim() || undefined,
          companyTelephone: companyTelephone.trim() || undefined,
          companyEmail: companyEmail.trim() || undefined,
          website: website.trim() || undefined,
          physicalAddress: physicalAddress.trim() || undefined,
          postalAddress: postalAddress.trim() || undefined,
          companyRegistrationNumber: companyRegistrationNumber.trim() || undefined,
          vatNumber: vatNumber.trim() || undefined,
          businessDescription: businessDescription.trim() || undefined,
          servicesOffered: servicesOffered.trim() || undefined,
          operatingHours: operatingHours.trim() || undefined,
          emergencyContactName: emergencyContactName.trim() || undefined,
          emergencyContactPhone: emergencyContactPhone.trim() || undefined,
          brandPrimaryColor: brandPrimaryColor.trim() || undefined,
          brandAccentColor: brandAccentColor.trim() || undefined,
          serviceGeography: {
            primaryCity: serviceCity.trim() || DEFAULT_YG_SERVICE_GEOGRAPHY.primaryCity,
            primaryProvince:
              serviceProvince.trim() || DEFAULT_YG_SERVICE_GEOGRAPHY.primaryProvince,
            serviceSuburbs: serviceSuburbsText
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean),
            outsideAreaPolicy,
            notes: geographyNotes.trim() || null,
          },
          cocSettings: {
            defaultApplicability: cocDefault,
            gasWorkRequiresCoc: gasRequiresCoc,
            electricalWorkRequiresCoc: electricalRequiresCoc,
            sansReferenceNote: sansNote.trim() || DEFAULT_YG_COC_SETTINGS.sansReferenceNote,
            documentLabel: cocDocumentLabel.trim() || DEFAULT_YG_COC_SETTINGS.documentLabel,
          },
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

  async function handleMediaUpload(kind: 'logo' | 'profile_image', file: File) {
    if (!accessToken || !canEdit) return;

    setIsUploadingLogo(true);
    setError(null);
    setSuccess(null);

    try {
      const buffer = await file.arrayBuffer();
      const dataBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      const updated = await uploadCompanyMedia(accessToken, {
        kind,
        mimeType: file.type,
        dataBase64,
      });
      setProfile(updated);
      setSuccess(`${kind === 'logo' ? 'Company logo' : 'Profile image'} uploaded.`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to upload image');
    } finally {
      setIsUploadingLogo(false);
    }
  }

  async function handleMediaRemove(fileId: string | null | undefined) {
    if (!accessToken || !canEdit || !fileId) return;
    setError(null);
    setSuccess(null);
    try {
      const updated = await removeCompanyMedia(accessToken, fileId);
      if (updated) setProfile(updated);
      setSuccess('Image removed.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to remove image');
    }
  }

  return (
    <>
      <PageHeader
        title="Company Profile"
        description="Business information used by AURA to understand your workspace. No demo data — fill in your real company details."
      />

      {error ? <p className="settings-alert settings-alert--error">{error}</p> : null}
      {success ? <p className="settings-alert settings-alert--success">{success}</p> : null}

      {isLoading && !profile ? (
        <LoadingState label="Loading company profile…" />
      ) : (
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
            <h2 className="settings-section__title">Contact & registration</h2>
            <div className="settings-grid">
              <Input
                label="Trading name"
                value={tradingName}
                onChange={(e) => setTradingName(e.target.value)}
                disabled={!canEdit}
              />
              <Input
                label="Owner name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                disabled={!canEdit}
              />
              <Input
                label="Owner job title"
                value={ownerJobTitle}
                onChange={(e) => setOwnerJobTitle(e.target.value)}
                disabled={!canEdit}
              />
              <Input
                label="Company telephone"
                value={companyTelephone}
                onChange={(e) => setCompanyTelephone(e.target.value)}
                disabled={!canEdit}
              />
              <Input
                label="Company email"
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
                disabled={!canEdit}
              />
              <Input
                label="Website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                disabled={!canEdit}
              />
              <Input
                label="Registration number"
                value={companyRegistrationNumber}
                onChange={(e) => setCompanyRegistrationNumber(e.target.value)}
                disabled={!canEdit}
              />
              <Input
                label="VAT number"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <label className="settings-field">
              <span className="settings-field__label">Physical address</span>
              <textarea
                className="settings-textarea"
                value={physicalAddress}
                onChange={(e) => setPhysicalAddress(e.target.value)}
                disabled={!canEdit}
                rows={2}
              />
            </label>
            <label className="settings-field">
              <span className="settings-field__label">Postal address</span>
              <textarea
                className="settings-textarea"
                value={postalAddress}
                onChange={(e) => setPostalAddress(e.target.value)}
                disabled={!canEdit}
                rows={2}
              />
            </label>
          </section>

          <section className="settings-section">
            <h2 className="settings-section__title">Brand images</h2>
            {!mediaConfigured ? (
              <p className="settings-meta">
                Image upload requires secure media storage. Set{' '}
                <code>COMPANY_MEDIA_STORAGE_PATH</code> on the API server, then restart the API.
              </p>
            ) : (
              <div className="settings-grid">
                <div className="settings-field">
                  <span className="settings-field__label">Company logo</span>
                  {profile?.preferences.logoFileId && accessToken ? (
                    <CompanyMediaImage
                      accessToken={accessToken}
                      fileId={profile.preferences.logoFileId}
                      alt="Company logo"
                      className="company-media-preview"
                    />
                  ) : (
                    <span className="app-sidebar__avatar" aria-hidden="true">
                      {(name || 'CO').slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  {canEdit ? (
                    <div className="page-header-actions">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        hidden
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void handleMediaUpload('logo', file);
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isUploadingLogo}
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {profile?.preferences.logoFileId ? 'Replace logo' : 'Upload logo'}
                      </Button>
                      {profile?.preferences.logoFileId ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void handleMediaRemove(profile.preferences.logoFileId)}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="settings-field">
                  <span className="settings-field__label">Profile image</span>
                  {profile?.preferences.profileImageFileId && accessToken ? (
                    <CompanyMediaImage
                      accessToken={accessToken}
                      fileId={profile.preferences.profileImageFileId}
                      alt="Company profile"
                      className="company-media-preview"
                    />
                  ) : (
                    <p className="page-muted">No profile image uploaded.</p>
                  )}
                  {canEdit ? (
                    <div className="page-header-actions">
                      <input
                        ref={profileImageInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        hidden
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void handleMediaUpload('profile_image', file);
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isUploadingLogo}
                        onClick={() => profileImageInputRef.current?.click()}
                      >
                        {profile?.preferences.profileImageFileId ? 'Replace image' : 'Upload image'}
                      </Button>
                      {profile?.preferences.profileImageFileId ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            void handleMediaRemove(profile.preferences.profileImageFileId)
                          }
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          <section className="settings-section">
            <h2 className="settings-section__title">Operations & brand</h2>
            <label className="settings-field">
              <span className="settings-field__label">Business description</span>
              <textarea
                className="settings-textarea"
                value={businessDescription}
                onChange={(e) => setBusinessDescription(e.target.value)}
                disabled={!canEdit}
                rows={3}
              />
            </label>
            <label className="settings-field">
              <span className="settings-field__label">Services offered</span>
              <textarea
                className="settings-textarea"
                value={servicesOffered}
                onChange={(e) => setServicesOffered(e.target.value)}
                disabled={!canEdit}
                rows={3}
              />
            </label>
            <div className="settings-grid">
              <Input
                label="Operating hours"
                value={operatingHours}
                onChange={(e) => setOperatingHours(e.target.value)}
                disabled={!canEdit}
              />
              <Input
                label="Emergency contact name"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                disabled={!canEdit}
              />
              <Input
                label="Emergency contact phone"
                value={emergencyContactPhone}
                onChange={(e) => setEmergencyContactPhone(e.target.value)}
                disabled={!canEdit}
              />
              <Input
                label="Brand primary colour"
                value={brandPrimaryColor}
                onChange={(e) => setBrandPrimaryColor(e.target.value)}
                disabled={!canEdit}
                placeholder="#1e3a5f"
              />
              <Input
                label="Brand accent colour"
                value={brandAccentColor}
                onChange={(e) => setBrandAccentColor(e.target.value)}
                disabled={!canEdit}
                placeholder="#0d9488"
              />
            </div>
          </section>

          <section className="settings-section">
            <h2 className="settings-section__title">Young Guns service geography (Cape Town)</h2>
            <p className="page-muted">
              UX-035 — encode Cape Town / Western Cape service area. Defaults favour Cape Town, not
              Johannesburg.
            </p>
            <div className="settings-grid">
              <Input
                label="Primary city"
                value={serviceCity}
                onChange={(e) => setServiceCity(e.target.value)}
                disabled={!canEdit}
              />
              <Input
                label="Primary province"
                value={serviceProvince}
                onChange={(e) => setServiceProvince(e.target.value)}
                disabled={!canEdit}
              />
              <label className="settings-field">
                <span className="settings-field__label">Outside-area policy</span>
                <select
                  className="titan-input"
                  value={outsideAreaPolicy}
                  onChange={(e) =>
                    setOutsideAreaPolicy(e.target.value as typeof outsideAreaPolicy)
                  }
                  disabled={!canEdit}
                >
                  <option value="manual_review">Manual review</option>
                  <option value="quote_travel">Quote travel</option>
                  <option value="decline">Decline</option>
                </select>
              </label>
            </div>
            <label className="settings-field">
              <span className="settings-field__label">Service suburbs (one per line)</span>
              <textarea
                className="settings-textarea"
                value={serviceSuburbsText}
                onChange={(e) => setServiceSuburbsText(e.target.value)}
                disabled={!canEdit}
                rows={8}
              />
            </label>
            <label className="settings-field">
              <span className="settings-field__label">Geography notes</span>
              <textarea
                className="settings-textarea"
                value={geographyNotes}
                onChange={(e) => setGeographyNotes(e.target.value)}
                disabled={!canEdit}
                rows={2}
              />
            </label>
          </section>

          <section className="settings-section">
            <h2 className="settings-section__title">COC / SANS applicability</h2>
            <p className="page-muted">
              Visibility and defaults for Certificate of Compliance. Classification remains per job
              — this does not auto-issue a COC.
            </p>
            <div className="settings-grid">
              <label className="settings-field">
                <span className="settings-field__label">Default applicability</span>
                <select
                  className="titan-input"
                  value={cocDefault}
                  onChange={(e) => setCocDefault(e.target.value as CocApplicability)}
                  disabled={!canEdit}
                >
                  <option value="not_applicable">Not applicable</option>
                  <option value="may_apply">May apply</option>
                  <option value="required_for_gas_work">Required for gas work</option>
                  <option value="required_for_electrical_work">Required for electrical work</option>
                  <option value="pending_classification">Pending classification</option>
                </select>
              </label>
              <Input
                label="COC document label"
                value={cocDocumentLabel}
                onChange={(e) => setCocDocumentLabel(e.target.value)}
                disabled={!canEdit}
              />
              <label className="settings-field">
                <span className="settings-field__label">
                  <input
                    type="checkbox"
                    checked={gasRequiresCoc}
                    onChange={(e) => setGasRequiresCoc(e.target.checked)}
                    disabled={!canEdit}
                  />{' '}
                  Gas / geyser work requires COC
                </span>
              </label>
              <label className="settings-field">
                <span className="settings-field__label">
                  <input
                    type="checkbox"
                    checked={electricalRequiresCoc}
                    onChange={(e) => setElectricalRequiresCoc(e.target.checked)}
                    disabled={!canEdit}
                  />{' '}
                  Electrical work requires COC
                </span>
              </label>
            </div>
            <label className="settings-field">
              <span className="settings-field__label">SANS / COC reference note</span>
              <textarea
                className="settings-textarea"
                value={sansNote}
                onChange={(e) => setSansNote(e.target.value)}
                disabled={!canEdit}
                rows={3}
              />
            </label>
          </section>

          <section className="settings-section">
            <h2 className="settings-section__title">Preferences</h2>
            <div className="settings-grid">
              <Input
                label="Timezone"
                name="timezone"
                placeholder={CAPE_TOWN_DEFAULT_TIMEZONE}
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                disabled={!canEdit}
              />
              <Input
                label="Currency"
                name="currency"
                placeholder="e.g. ZAR"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                disabled={!canEdit}
              />
              <Input
                label="Locale"
                name="locale"
                placeholder={CAPE_TOWN_DEFAULT_LOCALE}
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
            <p className="settings-readonly">
              You can view this profile but need owner access to edit.
            </p>
          )}
        </form>
      )}
    </>
  );
}
