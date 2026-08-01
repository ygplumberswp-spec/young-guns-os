import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Button, Input } from '@titan/ui';
import { COMMUNICATION_CHANNEL_OPTIONS, type CommunicationChannel } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { createMessageTemplate } from '../../lib/communications-api';
import { useAuth } from '../../lib/auth-context';
import { CommunicationsNav } from '../../features/communications/CommunicationsNav';
import { canManageCommunications } from '../../features/communications/utils';

export function TemplateCreatePage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<CommunicationChannel>('email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageCommunications(user.permissions) : false;

  useEffect(() => {
    if (user && !canWrite) navigate('/communications/templates');
  }, [canWrite, navigate, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite) return;

    setIsSaving(true);
    setError(null);

    try {
      await createMessageTemplate(accessToken, {
        name,
        channel,
        subject: subject.trim() || null,
        body,
      });
      navigate('/communications/templates');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create template');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="communications-page">
      <PageHeader
        title="New template"
        description="Create a reusable message template for customer communications."
      />
      <CommunicationsNav />
      {error ? <p className="form-error">{error}</p> : null}

      <form className="communications-form" onSubmit={(event) => void handleSubmit(event)}>
        <Input
          label="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <label className="titan-input-group">
          <span className="titan-input-label">Channel</span>
          <select
            className="titan-input"
            value={channel}
            onChange={(e) => setChannel(e.target.value as CommunicationChannel)}
          >
            {COMMUNICATION_CHANNEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <label className="titan-input-group">
          <span className="titan-input-label">Body</span>
          <textarea
            className="titan-input communications-textarea"
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </label>
        <Button type="submit" disabled={isSaving || !name.trim() || !body.trim()}>
          {isSaving ? 'Creating…' : 'Create template'}
        </Button>
      </form>
    </div>
  );
}
