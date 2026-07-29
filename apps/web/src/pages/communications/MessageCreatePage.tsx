import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, Input, PageHeader } from '@titan/ui';
import type { CustomerSummary } from '@titan/shared';
import {
  COMMUNICATION_CHANNEL_OPTIONS,
  COMMUNICATION_DIRECTION_OPTIONS,
  type CommunicationChannel,
  type CommunicationDirection,
  type MessageTemplateSummary,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomers } from '../../lib/crm-api';
import {
  createCommunicationMessage,
  fetchMessageTemplates,
} from '../../lib/communications-api';
import { useAuth } from '../../lib/auth-context';
import { CommunicationsNav } from '../../features/communications/CommunicationsNav';
import { canManageCommunications } from '../../features/communications/utils';

export function MessageCreatePage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [templates, setTemplates] = useState<MessageTemplateSummary[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [channel, setChannel] = useState<CommunicationChannel>('note');
  const [direction, setDirection] = useState<CommunicationDirection>('outbound');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageCommunications(user.permissions) : false;

  useEffect(() => {
    if (user && !canWrite) navigate('/communications/messages');
  }, [canWrite, navigate, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const [customerData, templateData] = await Promise.all([
          fetchCustomers(accessToken),
          fetchMessageTemplates(accessToken),
        ]);

        if (!cancelled) {
          setCustomers(customerData);
          setTemplates(templateData);
          setCustomerId(customerData[0]?.id ?? '');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load form data');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadData();
    return () => { cancelled = true; };
  }, [accessToken]);

  function handleTemplateChange(nextTemplateId: string) {
    setTemplateId(nextTemplateId);

    const template = templates.find((item) => item.id === nextTemplateId);

    if (!template) {
      return;
    }

    setChannel(template.channel);
    setSubject(template.subject ?? '');
    setBody(template.body);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !customerId) return;

    setIsSaving(true);
    setError(null);

    try {
      await createCommunicationMessage(accessToken, {
        customerId,
        templateId: templateId || null,
        channel,
        direction,
        subject: subject.trim() || null,
        body,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
      });
      navigate('/communications/messages');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to log communication');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading form…</p>;

  return (
    <div className="communications-page">
      <PageHeader
        title="Log communication"
        description="Record a customer interaction in your communication history."
        actions={
          <Link href="/communications/messages">
            <Button variant="secondary">Back to history</Button>
          </Link>
        }
      />
      <CommunicationsNav />
      {error ? <p className="form-error">{error}</p> : null}

      {customers.length === 0 ? (
        <p className="page-muted">
          <Link href="/crm/new" className="communications-link">
            Add a customer
          </Link>{' '}
          before logging communications.
        </p>
      ) : (
        <form className="communications-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="titan-input-group">
            <span className="titan-input-label">Customer</span>
            <select className="titan-input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Template (optional)</span>
            <select className="titan-input" value={templateId} onChange={(e) => handleTemplateChange(e.target.value)}>
              <option value="">No template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Channel</span>
            <select className="titan-input" value={channel} onChange={(e) => setChannel(e.target.value as CommunicationChannel)}>
              {COMMUNICATION_CHANNEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Direction</span>
            <select className="titan-input" value={direction} onChange={(e) => setDirection(e.target.value as CommunicationDirection)}>
              {COMMUNICATION_DIRECTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <label className="titan-input-group">
            <span className="titan-input-label">Message</span>
            <textarea className="titan-input communications-textarea" rows={5} value={body} onChange={(e) => setBody(e.target.value)} required />
          </label>
          <Input label="Occurred at" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          <Button type="submit" disabled={isSaving || !body.trim()}>{isSaving ? 'Saving…' : 'Log communication'}</Button>
        </form>
      )}
    </div>
  );
}
