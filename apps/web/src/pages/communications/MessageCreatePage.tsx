import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, Input } from '@titan/ui';
import type { CustomerSummary, JobSummary } from '@titan/shared';
import {
  COMMUNICATION_CHANNEL_OPTIONS,
  COMMUNICATION_DIRECTION_OPTIONS,
  COMMUNICATION_VISIBILITY_OPTIONS,
  type CommunicationChannel,
  type CommunicationDirection,
  type CommunicationVisibility,
  type MessageTemplateSummary,
} from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchCustomers } from '../../lib/crm-api';
import { fetchJobs } from '../../lib/jobs-api';
import { createCommunicationMessage, fetchMessageTemplates } from '../../lib/communications-api';
import { useAuth } from '../../lib/auth-context';
import { CommunicationsNav } from '../../features/communications/CommunicationsNav';
import {
  canManageCommunications,
  newCommunicationClientActionId,
} from '../../features/communications/utils';

export function MessageCreatePage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [templates, setTemplates] = useState<MessageTemplateSummary[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [jobId, setJobId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [channel, setChannel] = useState<CommunicationChannel>('note');
  const [direction, setDirection] = useState<CommunicationDirection>('outbound');
  const [visibility, setVisibility] = useState<CommunicationVisibility>('internal_note');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Stable for the lifetime of this form instance so a failed submit can be
  // safely retried without creating a duplicate communication record.
  const [clientActionId] = useState(() => newCommunicationClientActionId());

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
        const [customerData, templateData, jobData] = await Promise.all([
          fetchCustomers(accessToken),
          fetchMessageTemplates(accessToken),
          fetchJobs(accessToken),
        ]);

        if (!cancelled) {
          setCustomers(customerData);
          setTemplates(templateData);
          setJobs(jobData);
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
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const jobsForCustomer = useMemo(
    () => jobs.filter((job) => !customerId || job.customerId === customerId),
    [jobs, customerId],
  );

  useEffect(() => {
    if (jobId && !jobsForCustomer.some((job) => job.id === jobId)) {
      setJobId('');
    }
  }, [jobId, jobsForCustomer]);

  const honestyNote =
    visibility === 'internal_note'
      ? 'Logged only — staff-visible internal note. Never shown to the customer.'
      : visibility === 'customer_visible'
        ? 'Logged only — visible to the customer in the portal. Not sent via email/SMS provider.'
        : channel === 'email' || channel === 'sms'
          ? `Requested only — TITAN does not have a connected ${channel === 'email' ? 'email' : 'SMS'} send path yet. This will be logged as "requested", not "delivered".`
          : 'Requested only — no automated dispatch exists for this channel yet. Logged for follow-up.';

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
        jobId: jobId || null,
        templateId: templateId || null,
        channel,
        direction,
        visibility,
        subject: subject.trim() || null,
        body,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        clientActionId,
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
        title="Log Communication"
        description="Record a customer interaction in your communication history."
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
            <select
              className="titan-input"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
            >
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Job (optional)</span>
            <select className="titan-input" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">No linked job</option>
              {jobsForCustomer.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.jobNumber ?? job.title}
                </option>
              ))}
            </select>
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Template (optional)</span>
            <select
              className="titan-input"
              value={templateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
            >
              <option value="">No template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
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
          <label className="titan-input-group">
            <span className="titan-input-label">Direction</span>
            <select
              className="titan-input"
              value={direction}
              onChange={(e) => setDirection(e.target.value as CommunicationDirection)}
            >
              {COMMUNICATION_DIRECTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="titan-input-group">
            <span className="titan-input-label">Visibility</span>
            <select
              className="titan-input"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as CommunicationVisibility)}
            >
              {COMMUNICATION_VISIBILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="page-muted communications-honesty-note">{honestyNote}</p>
          <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <label className="titan-input-group">
            <span className="titan-input-label">Message</span>
            <textarea
              className="titan-input communications-textarea"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
          </label>
          <Input
            label="Occurred At"
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
          <Button type="submit" disabled={isSaving || !body.trim()}>
            {isSaving ? 'Saving…' : 'Log communication'}
          </Button>
        </form>
      )}
    </div>
  );
}
