import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { Button, Input, PageHeader, Panel } from '@titan/ui';
import type {
  CustomerDetail,
  CustomerStatus,
  CustomerPortalAccessSummary,
  WhatsappMessageSummary,
} from '@titan/shared';
import { AI_NAME, CUSTOMER_STATUS_OPTIONS, isPlaceholderEmail } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { addCustomerActivity, fetchCustomer, updateCustomer } from '../../lib/crm-api';
import {
  createCustomerPortalInvite,
  fetchCustomerPortalAccess,
  revokeCustomerPortalInvite,
  revokePortalUserAccess,
} from '../../lib/portal-admin-api';
import {
  approveWhatsappDraft,
  fetchWhatsappMessages,
  sendWhatsappMessage,
} from '../../lib/whatsapp-api';
import { useAuth } from '../../lib/auth-context';
import { canManageCustomers } from '../../features/crm/CustomerList';
import {
  canCreateJobAtProperty,
  CustomerPropertiesPanel,
} from '../../features/crm/CustomerPropertiesPanel';
import { canAccessMarketingIntelligence } from '../../features/marketing-intelligence/utils';

function formatStatus(status: CustomerDetail['status']): string {
  return CUSTOMER_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function CustomerDetailPage() {
  const [, params] = useRoute('/crm/:id');
  const customerId = params?.id ?? '';
  const { accessToken, user } = useAuth();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<CustomerStatus>('active');
  const [notes, setNotes] = useState('');
  const [activityContent, setActivityContent] = useState('');
  const [whatsappMessages, setWhatsappMessages] = useState<WhatsappMessageSummary[]>([]);
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [isLoadingWhatsapp, setIsLoadingWhatsapp] = useState(false);
  const [isSendingWhatsapp, setIsSendingWhatsapp] = useState(false);
  const [sendAsDraft, setSendAsDraft] = useState(true);
  const [portalAccess, setPortalAccess] = useState<CustomerPortalAccessSummary | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [isInvitingPortal, setIsInvitingPortal] = useState(false);

  const canWrite = useMemo(() => (user ? canManageCustomers(user.permissions) : false), [user]);

  const canCreateJob = useMemo(
    () => (user ? canCreateJobAtProperty(user.permissions) : false),
    [user],
  );

  const canAccessReactivation = useMemo(
    () => (user ? canAccessMarketingIntelligence(user.permissions) : false),
    [user],
  );

  const canCommunicate = useMemo(
    () =>
      user
        ? user.permissions.includes('communications:write') ||
          user.permissions.includes('integrations:manage')
        : false,
    [user],
  );

  const canManagePortal = useMemo(
    () =>
      user
        ? user.permissions.includes('portal:manage') ||
          user.permissions.includes('customers:write') ||
          user.permissions.includes('*')
        : false,
    [user],
  );

  async function loadPortalAccess() {
    if (!accessToken || !customerId || !canManagePortal) {
      return;
    }

    setIsPortalLoading(true);
    try {
      const access = await fetchCustomerPortalAccess(accessToken, customerId);
      setPortalAccess(access);
    } catch {
      setPortalAccess(null);
    } finally {
      setIsPortalLoading(false);
    }
  }

  async function loadCustomer() {
    if (!accessToken || !customerId) {
      return;
    }

    const data = await fetchCustomer(accessToken, customerId);
    setCustomer(data);
    setName(data.name);
    setEmail(data.email ?? '');
    setPhone(data.phone ?? '');
    setStatus(data.status);
    setNotes(data.notes ?? '');
    if (data.email) {
      setInviteEmail(data.email);
    }

    if (canCommunicate) {
      setIsLoadingWhatsapp(true);
      try {
        const messages = await fetchWhatsappMessages(accessToken, customerId);
        setWhatsappMessages(messages);
      } catch {
        setWhatsappMessages([]);
      } finally {
        setIsLoadingWhatsapp(false);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !customerId) {
        setIsLoading(false);
        return;
      }

      try {
        await loadCustomer();
        await loadPortalAccess();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load customer');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [accessToken, customerId, canCommunicate, canManagePortal]);

  async function handleInvitePortal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !customerId || !canManagePortal || !inviteEmail.trim()) {
      return;
    }

    setIsInvitingPortal(true);
    setError(null);
    setInviteUrl(null);

    try {
      const result = await createCustomerPortalInvite(accessToken, customerId, {
        email: inviteEmail.trim(),
      });
      setInviteUrl(result.inviteUrl);
      await loadPortalAccess();
      setSuccess('Customer portal invitation created.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create portal invitation');
    } finally {
      setIsInvitingPortal(false);
    }
  }

  async function handleRevokePortalInvite(inviteId: string) {
    if (!accessToken || !customerId || !canManagePortal) {
      return;
    }

    try {
      await revokeCustomerPortalInvite(accessToken, customerId, inviteId);
      await loadPortalAccess();
      setSuccess('Invitation revoked.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to revoke invitation');
    }
  }

  async function handleRevokePortalAccess(portalUserId: string) {
    if (!accessToken || !canManagePortal) {
      return;
    }

    try {
      await revokePortalUserAccess(accessToken, portalUserId);
      await loadPortalAccess();
      setSuccess('Portal access deactivated.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to revoke portal access');
    }
  }

  async function handleSendWhatsapp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !customerId || !canCommunicate) {
      return;
    }

    setIsSendingWhatsapp(true);
    setError(null);
    setSuccess(null);

    try {
      const message = await sendWhatsappMessage(accessToken, {
        customerId,
        messageContent: whatsappMessage,
        asDraft: sendAsDraft,
      });
      setWhatsappMessages((current) => [message, ...current]);
      setWhatsappMessage('');
      setSuccess(sendAsDraft ? 'WhatsApp draft created for approval.' : 'WhatsApp message sent.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to send WhatsApp message');
    } finally {
      setIsSendingWhatsapp(false);
    }
  }

  async function handleApproveWhatsappDraft(messageId: string) {
    if (!accessToken || !canCommunicate) {
      return;
    }

    setIsSendingWhatsapp(true);
    setError(null);
    setSuccess(null);

    try {
      const message = await approveWhatsappDraft(accessToken, messageId);
      setWhatsappMessages((current) =>
        current.map((entry) => (entry.id === messageId ? message : entry)),
      );
      setSuccess('WhatsApp draft approved and sent.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to approve WhatsApp draft');
    } finally {
      setIsSendingWhatsapp(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !customerId || !canWrite) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await updateCustomer(accessToken, customerId, {
        name,
        email: email.trim() || null,
        phone: phone.trim() || null,
        status,
        notes: notes.trim() || null,
      });

      setCustomer(updated);
      setIsEditing(false);
      setSuccess('Customer updated.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update customer');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !customerId || !canWrite) {
      return;
    }

    setIsAddingNote(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await addCustomerActivity(accessToken, customerId, {
        content: activityContent,
      });

      setCustomer(updated);
      setActivityContent('');
      setSuccess('Activity note added.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to add activity note');
    } finally {
      setIsAddingNote(false);
    }
  }

  if (isLoading) {
    return <p className="page-muted">Loading customer…</p>;
  }

  if (error && !customer) {
    return (
      <div className="crm-page">
        <PageHeader title="Customer" description="Customer record" />
        <p className="form-error">{error}</p>
        <Link href="/crm">
          <Button variant="secondary">Back to customers</Button>
        </Link>
      </div>
    );
  }

  if (!customer) {
    return null;
  }

  return (
    <div className="crm-page">
      <PageHeader
        title={customer.name}
        description="Customer profile and activity history."
        actions={
          <div className="crm-detail__actions">
            <Link href={`/aura?customerId=${customer.id}`}>
              <Button variant="secondary">Ask {AI_NAME}</Button>
            </Link>
            <Link href="/crm">
              <Button variant="ghost">Back to customers</Button>
            </Link>
          </div>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {customer.email && isPlaceholderEmail(customer.email) ? (
        <p className="form-error">
          This customer&apos;s email looks like a shared/placeholder company inbox, not a
          verified personal address. It will not count as verified contact for marketing.
          {canAccessReactivation ? (
            <>
              {' '}
              <Link href="/marketing?tab=reactivation">Review in Reactivation Eligibility</Link>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="crm-detail">
        <Panel title="Profile">
          {isEditing && canWrite ? (
            <form className="crm-form" onSubmit={(event) => void handleSave(event)}>
              <Input
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />

              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />

              <Input
                label="Phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />

              <label className="titan-input-group">
                <span className="titan-input-label">Status</span>
                <select
                  className="titan-input"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as CustomerStatus)}
                >
                  {CUSTOMER_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="titan-input-group">
                <span className="titan-input-label">Notes</span>
                <textarea
                  className="titan-input crm-textarea"
                  rows={4}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>

              <div className="crm-form__actions">
                <Button type="submit" disabled={isSaving || !name.trim()}>
                  {isSaving ? 'Saving…' : 'Save changes'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <dl className="crm-detail-list">
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`crm-status crm-status--${customer.status}`}>
                    {formatStatus(customer.status)}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{customer.email ?? '—'}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{customer.phone ?? '—'}</dd>
              </div>
              <div>
                <dt>Notes</dt>
                <dd>{customer.notes ?? '—'}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{new Date(customer.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{new Date(customer.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
          )}

          {canWrite && !isEditing ? (
            <div className="crm-form__actions">
              <Button type="button" onClick={() => setIsEditing(true)}>
                Edit customer
              </Button>
            </div>
          ) : null}
        </Panel>

        {accessToken ? (
          <CustomerPropertiesPanel
            accessToken={accessToken}
            customerId={customerId}
            canWrite={canWrite}
            canCreateJob={canCreateJob}
          />
        ) : null}

        <Panel title="Activity notes">
          {canWrite ? (
            <form className="crm-activity-form" onSubmit={(event) => void handleAddActivity(event)}>
              <label className="titan-input-group">
                <span className="titan-input-label">Add note</span>
                <textarea
                  className="titan-input crm-textarea"
                  rows={3}
                  value={activityContent}
                  onChange={(event) => setActivityContent(event.target.value)}
                  placeholder="Log a call, meeting, or update about this customer"
                  required
                />
              </label>
              <Button type="submit" disabled={isAddingNote || !activityContent.trim()}>
                {isAddingNote ? 'Adding…' : 'Add note'}
              </Button>
            </form>
          ) : null}

          {customer.activities.length === 0 ? (
            <p className="page-muted">No activity notes yet.</p>
          ) : (
            <ul className="crm-activity-list">
              {customer.activities.map((activity) => (
                <li key={activity.id} className="crm-activity-item">
                  <p className="crm-activity-item__content">{activity.content}</p>
                  <p className="crm-activity-item__meta">
                    {activity.authorName} · {new Date(activity.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {canManagePortal ? (
          <Panel title="Customer portal access">
            {isPortalLoading ? <p className="page-muted">Loading portal access…</p> : null}
            {portalAccess?.portalUser ? (
              <div className="stack-form">
                <p>
                  Active portal user: <strong>{portalAccess.portalUser.email}</strong>
                  {portalAccess.portalUser.isActive ? ' · Active' : ' · Inactive'}
                </p>
                {portalAccess.portalUser.isActive ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleRevokePortalAccess(portalAccess.portalUser!.id)}
                  >
                    Deactivate portal login
                  </Button>
                ) : null}
              </div>
            ) : portalAccess?.pendingInvite ? (
              <div className="stack-form">
                <p>
                  Invitation pending for <strong>{portalAccess.pendingInvite.email}</strong> until{' '}
                  {new Date(portalAccess.pendingInvite.expiresAt).toLocaleString()}.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleRevokePortalInvite(portalAccess.pendingInvite!.id)}
                >
                  Revoke invitation
                </Button>
              </div>
            ) : (
              <form className="stack-form" onSubmit={(event) => void handleInvitePortal(event)}>
                <p className="page-muted">
                  Invite this customer to their own portal. Creating the customer record does not
                  grant login access.
                </p>
                <Input
                  label="Invitation email"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  required
                />
                <Button type="submit" disabled={isInvitingPortal || !inviteEmail.trim()}>
                  {isInvitingPortal ? 'Creating invitation…' : 'Invite to portal'}
                </Button>
                {inviteUrl ? (
                  <p className="page-muted">
                    Share this secure link with the customer: {inviteUrl}
                  </p>
                ) : null}
              </form>
            )}
          </Panel>
        ) : null}

        <Panel title="WhatsApp">
          {isLoadingWhatsapp ? (
            <p className="page-muted">Loading WhatsApp history…</p>
          ) : whatsappMessages.length === 0 ? (
            <p className="page-muted">No WhatsApp messages for this customer yet.</p>
          ) : (
            <ul className="crm-activity-list">
              {whatsappMessages.map((message) => (
                <li key={message.id} className="crm-activity-item">
                  <p className="crm-activity-item__content">{message.messageContent}</p>
                  <p className="crm-activity-item__meta">
                    {message.direction} · {message.deliveryStatus}
                    {message.isDraft ? ' · draft' : ''} ·{' '}
                    {new Date(message.createdAt).toLocaleString()}
                  </p>
                  {message.isDraft && canCommunicate ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isSendingWhatsapp}
                      onClick={() => void handleApproveWhatsappDraft(message.id)}
                    >
                      Approve & send
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canCommunicate ? (
            <form
              className="crm-activity-form"
              onSubmit={(event) => void handleSendWhatsapp(event)}
            >
              <label className="titan-input-group">
                <span className="titan-input-label">Send WhatsApp message</span>
                <textarea
                  className="titan-input crm-textarea"
                  rows={3}
                  value={whatsappMessage}
                  onChange={(event) => setWhatsappMessage(event.target.value)}
                  placeholder="Write a WhatsApp message for this customer"
                  required
                />
              </label>
              <label className="titan-checkbox">
                <input
                  type="checkbox"
                  checked={sendAsDraft}
                  onChange={(event) => setSendAsDraft(event.target.checked)}
                />
                Save as draft for approval (recommended)
              </label>
              <Button
                type="submit"
                disabled={isSendingWhatsapp || !whatsappMessage.trim() || !phone.trim()}
              >
                {isSendingWhatsapp ? 'Sending…' : sendAsDraft ? 'Create draft' : 'Send WhatsApp'}
              </Button>
              {!phone.trim() ? (
                <p className="page-muted">
                  Add a phone number to the customer profile to send WhatsApp messages.
                </p>
              ) : null}
            </form>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
