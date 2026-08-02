import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import type { BulkOperationSummary, LeadStatus, LeadSummary } from '@titan/shared';
import {
  buildEmailHref,
  buildWhatsAppHref,
  getLeadDeleteEligibility,
  getLeadStatusLabel,
  getLeadStatusTone,
  LEAD_QUICK_STATUS_ACTIONS,
  LEAD_STATUS_FILTER_GROUPS,
  leadStatusesForFilterGroups,
} from '@titan/shared';
import { EmptyState, LoadingState, Panel } from '@titan/ui';
import { bulkLeads, deleteLead, updateLead } from '../../lib/leads-api';
import {
  BulkActionBar,
  BulkCommunicationsReview,
  MultiStatusFilter,
  RowActionsCell,
  StatusBadgeDropdown,
  StatusRowAccent,
  TypedDeleteDialog,
  type InlineSaveState,
  type MoreMenuItem,
  useConfirmDialog,
} from '../../components/ux';
import { useAuth } from '../../lib/auth-context';

type LeadListTableProps = {
  leads: LeadSummary[];
  totalCount?: number;
  isLoading: boolean;
  error: string | null;
  canWrite: boolean;
  canConvert: boolean;
  accessToken: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  overdueOnly: boolean;
  onOverdueOnlyChange: (value: boolean) => void;
  onRefresh: () => Promise<void>;
};

type RowSaveState = Record<string, InlineSaveState>;

export function LeadListTable({
  leads,
  totalCount,
  isLoading,
  error,
  canWrite,
  canConvert,
  accessToken,
  search,
  onSearchChange,
  overdueOnly,
  onOverdueOnlyChange,
  onRefresh,
}: LeadListTableProps) {
  const [, navigate] = useLocation();
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rowSaveState, setRowSaveState] = useState<RowSaveState>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkReviewChannel, setBulkReviewChannel] = useState<'email' | 'whatsapp' | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkOperationSummary | null>(null);
  const { user } = useAuth();
  const { confirm, alert, dialog: confirmDialog } = useConfirmDialog();

  const isOwner = useMemo(
    () =>
      Boolean(
        user?.permissions.includes('*') ||
          user?.roleName === 'Company Owner' ||
          user?.roleName === 'Owner' ||
          user?.roleName?.toLowerCase() === 'owner',
      ),
    [user],
  );

  const filteredLeads = useMemo(() => {
    if (statusFilters.length === 0) return leads;
    const allowed = new Set(leadStatusesForFilterGroups(statusFilters));
    return leads.filter((lead) => allowed.has(lead.status));
  }, [leads, statusFilters]);

  const allSelected =
    filteredLeads.length > 0 && filteredLeads.every((lead) => selectedIds.has(lead.id));

  const setRowState = useCallback((leadId: string, state: InlineSaveState) => {
    setRowSaveState((prev) => ({ ...prev, [leadId]: state }));
    if (state === 'saved') {
      window.setTimeout(() => {
        setRowSaveState((prev) => {
          if (prev[leadId] !== 'saved') return prev;
          const next = { ...prev };
          delete next[leadId];
          return next;
        });
      }, 2000);
    }
  }, []);

  async function changeLeadStatus(lead: LeadSummary, targetStatus: LeadStatus, reason?: string) {
    if (!accessToken || !canWrite) return;
    setRowState(lead.id, 'saving');
    try {
      await updateLead(accessToken, lead.id, {
        status: targetStatus,
        lostReason:
          targetStatus === 'lost' || targetStatus === 'duplicate'
            ? reason ?? 'Updated from lead list'
            : undefined,
        reopenReason:
          targetStatus === 'new' && ['converted', 'lost', 'duplicate'].includes(lead.status)
            ? reason ?? 'Returned to new from list'
            : undefined,
      });
      setRowState(lead.id, 'saved');
      await onRefresh();
    } catch (err) {
      setRowState(lead.id, 'failed');
      throw err;
    }
  }

  async function handleQuickAction(lead: LeadSummary, actionId: string) {
    const action = LEAD_QUICK_STATUS_ACTIONS.find((entry) => entry.id === actionId);
    if (!action || action.targetStatus === lead.status) return;
    await changeLeadStatus(lead, action.targetStatus);
  }

  async function handleDeleteLead(lead: LeadSummary) {
    const eligibility = getLeadDeleteEligibility(lead);
    if (!eligibility.canDelete) {
      await alert(
        eligibility.blockReason ?? 'This lead cannot be deleted. Use Archive instead.',
        'Cannot delete lead',
      );
      return;
    }
    const confirmed = await confirm({
      title: 'Delete lead',
      message: `Delete lead "${lead.companyName || lead.contactName}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!confirmed) {
      return;
    }
    if (!accessToken) return;
    setRowState(lead.id, 'saving');
    try {
      await deleteLead(accessToken, lead.id);
      setRowState(lead.id, 'saved');
      await onRefresh();
    } catch {
      setRowState(lead.id, 'failed');
    }
  }

  function buildLeadActions(lead: LeadSummary): MoreMenuItem[] {
    const eligibility = getLeadDeleteEligibility(lead);

    return [
      { id: 'view', label: 'View', onSelect: () => navigate(`/leads/${lead.id}`) },
      { id: 'edit', label: 'Edit', onSelect: () => navigate(`/leads/${lead.id}#edit`) },
      {
        id: 'qualify',
        label: 'Accept / Qualify',
        hidden: !canWrite,
        disabled: lead.status === 'qualified',
        onSelect: () => void changeLeadStatus(lead, 'qualified'),
      },
      {
        id: 'pending',
        label: 'Pending',
        hidden: !canWrite,
        disabled: lead.status === 'awaiting_information',
        onSelect: () => void changeLeadStatus(lead, 'awaiting_information'),
      },
      {
        id: 'decline',
        label: 'Decline',
        hidden: !canWrite,
        disabled: lead.status === 'lost',
        onSelect: () => void changeLeadStatus(lead, 'lost'),
      },
      {
        id: 'assign',
        label: 'Assign',
        hidden: !canWrite,
        onSelect: () => navigate(`/leads/${lead.id}#assign`),
      },
      {
        id: 'convert',
        label: 'Convert to customer',
        hidden: !canConvert || lead.status === 'converted',
        onSelect: () => navigate(`/leads/${lead.id}#convert`),
      },
      {
        id: 'archive',
        label: eligibility.archiveLabel,
        hidden: !canWrite,
        disabled: lead.status === 'duplicate',
        onSelect: () => void changeLeadStatus(lead, 'duplicate'),
      },
      {
        id: 'delete',
        label: eligibility.deleteLabel,
        hidden: !canWrite,
        disabled: !eligibility.canDelete,
        onSelect: () => void handleDeleteLead(lead),
      },
    ];
  }

  async function bulkSetStatus(targetStatus: LeadStatus) {
    if (!accessToken || !canWrite || selectedIds.size === 0) return;
    setBulkSaving(true);
    try {
      const summary = await bulkLeads(accessToken, {
        ids: [...selectedIds],
        action: 'set_status',
        status: targetStatus,
      });
      setBulkResult(summary);
      setSelectedIds(new Set());
      await onRefresh();
    } finally {
      setBulkSaving(false);
    }
  }

  async function bulkArchive() {
    if (!accessToken || !canWrite || selectedIds.size === 0) return;
    setBulkSaving(true);
    try {
      const summary = await bulkLeads(accessToken, {
        ids: [...selectedIds],
        action: 'archive',
      });
      setBulkResult(summary);
      setSelectedIds(new Set());
      await onRefresh();
    } finally {
      setBulkSaving(false);
    }
  }

  async function bulkDeleteConfirmed() {
    if (!accessToken || !canWrite || selectedIds.size === 0) return;
    setBulkSaving(true);
    try {
      const summary = await bulkLeads(accessToken, {
        ids: [...selectedIds],
        action: 'delete',
        typedConfirmation: 'DELETE',
      });
      setBulkResult(summary);
      setSelectedIds(new Set());
      setShowBulkDelete(false);
      await onRefresh();
    } finally {
      setBulkSaving(false);
    }
  }

  const selectedLeads = useMemo(
    () => filteredLeads.filter((lead) => selectedIds.has(lead.id)),
    [filteredLeads, selectedIds],
  );

  function toggleSelectAll(checked: boolean) {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filteredLeads.map((lead) => lead.id)));
  }

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const filterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of LEAD_STATUS_FILTER_GROUPS) {
      counts.set(group.id, 0);
    }
    for (const lead of leads) {
      for (const group of LEAD_STATUS_FILTER_GROUPS) {
        if (group.statuses.includes(lead.status)) {
          counts.set(group.id, (counts.get(group.id) ?? 0) + 1);
        }
      }
    }
    return LEAD_STATUS_FILTER_GROUPS.map((group) => ({
      id: group.id,
      label: group.label,
      tone: group.tone,
      count: counts.get(group.id) ?? 0,
    }));
  }, [leads]);

  const bulkActions = canWrite
    ? [
        {
          id: 'assign',
          label: 'Assign',
          onClick: () => navigate('/leads#assign-bulk'),
          disabled: bulkSaving || selectedIds.size === 0,
        },
        {
          id: 'status',
          label: 'Change status',
          onClick: () => void bulkSetStatus('qualified'),
          disabled: bulkSaving,
        },
        {
          id: 'email',
          label: 'Email',
          onClick: () => setBulkReviewChannel('email'),
          disabled: bulkSaving || selectedIds.size === 0,
        },
        {
          id: 'whatsapp',
          label: 'WhatsApp',
          onClick: () => setBulkReviewChannel('whatsapp'),
          disabled: bulkSaving || selectedIds.size === 0,
        },
        {
          id: 'archive',
          label: 'Archive',
          onClick: () => void bulkArchive(),
          disabled: bulkSaving,
        },
        ...(isOwner
          ? [
              {
                id: 'delete',
                label: 'Delete',
                onClick: () => setShowBulkDelete(true),
                disabled: bulkSaving,
                variant: 'destructive' as const,
              },
            ]
          : []),
        {
          id: 'clear',
          label: 'Clear selection',
          onClick: () => setSelectedIds(new Set()),
          disabled: bulkSaving || selectedIds.size === 0,
        },
      ]
    : [];

  return (
    <>
    <Panel title="Lead Registry">
      <p className="leads-summary-line">
        Showing {filteredLeads.length} of {totalCount ?? leads.length} Leads
      </p>
      <div className="leads-toolbar">
        <input
          className="input"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search name, mobile, email, suburb…"
          aria-label="Search leads"
        />
        <label className="leads-toolbar__check">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(event) => onOverdueOnlyChange(event.target.checked)}
          />
          Overdue Only
        </label>
      </div>

      <MultiStatusFilter
        options={filterOptions}
        selected={statusFilters}
        onChange={setStatusFilters}
        ariaLabel="Filter leads by status"
      />

      <BulkActionBar
        selectedCount={selectedIds.size}
        totalCount={filteredLeads.length}
        onSelectAll={toggleSelectAll}
        allSelected={allSelected}
        actions={bulkActions}
      />

      {bulkResult ? (
        <p className="page-muted">
          Bulk complete — deleted {bulkResult.deleted}, archived {bulkResult.archived}, updated{' '}
          {bulkResult.updated}, blocked {bulkResult.blocked}, skipped {bulkResult.skipped}.
        </p>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
      {isLoading ? <LoadingState label="Loading leads…" /> : null}

      {!isLoading && filteredLeads.length === 0 ? (
        <EmptyState
          title={search || statusFilters.length || overdueOnly ? 'No matching leads' : 'No leads yet'}
          description={
            canWrite
              ? 'Add a lead to capture an enquiry without retyping later at conversion.'
              : 'No leads are available for your role.'
          }
        />
      ) : null}

      {filteredLeads.length > 0 ? (
        <div className="table-scroll leads-list">
          <table className="data-table leads-table leads-table--compact leads-table--phase4">
            <thead>
              <tr>
                <th className="leads-table__check-col" aria-label="Select" />
                <th>Lead</th>
                <th className="leads-table__hide-mobile">Contact</th>
                <th className="leads-table__hide-mobile">Service</th>
                <th className="leads-table__hide-mobile">Suburb</th>
                <th className="leads-table__hide-mobile">Source</th>
                <th className="leads-table__hide-mobile">Owner</th>
                <th className="leads-table__hide-mobile">Est. value</th>
                <th className="leads-table__hide-mobile">Age</th>
                <th className="leads-table__hide-mobile">Next action</th>
                <th className="leads-table__actions-col leads-table__actions-col--wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => {
                const tone = getLeadStatusTone(lead.status);
                const saveState = rowSaveState[lead.id] ?? 'idle';
                const displayName = lead.companyName || lead.contactName;

                return (
                  <StatusRowAccent key={lead.id} tone={tone} className="leads-table__row">
                    <td className="leads-table__check-col">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lead.id)}
                        onChange={(event) => toggleRow(lead.id, event.target.checked)}
                        aria-label={`Select ${displayName}`}
                      />
                    </td>
                    <td className="leads-table__primary">
                      <div className="leads-table__name-line">
                        <Link href={`/leads/${lead.id}`} className="table-link">
                          {displayName}
                        </Link>
                        <StatusBadgeDropdown
                          label={getLeadStatusLabel(lead.status)}
                          tone={tone}
                          canChange={canWrite && saveState !== 'saving'}
                          saveState={saveState}
                          options={LEAD_QUICK_STATUS_ACTIONS.map((action) => ({
                            id: action.id,
                            label: action.label,
                            disabled: action.targetStatus === lead.status,
                          }))}
                          onSelect={(actionId) => void handleQuickAction(lead, actionId)}
                        />
                      </div>
                      <div className="leads-table__mobile-meta">
                        <span>{lead.contactPhoneE164 || lead.contactPhone || '—'}</span>
                        <span>{lead.sourceName || '—'}</span>
                        {lead.isOverdue ? <span className="badge-warn">Overdue</span> : null}
                      </div>
                    </td>
                    <td className="leads-table__hide-mobile">
                      {lead.contactPhoneE164 || lead.contactPhone || '—'}
                      {lead.contactEmail ? (
                        <div className="muted-text">{lead.contactEmail}</div>
                      ) : null}
                    </td>
                    <td className="leads-table__hide-mobile">{lead.serviceType || '—'}</td>
                    <td className="leads-table__hide-mobile">{lead.suburb || '—'}</td>
                    <td className="leads-table__hide-mobile">{lead.sourceName || '—'}</td>
                    <td className="leads-table__hide-mobile">{lead.assignedUserName || '—'}</td>
                    <td className="leads-table__hide-mobile">—</td>
                    <td className="leads-table__hide-mobile">{lead.ageDays}d</td>
                    <td className="leads-table__hide-mobile">
                      {lead.nextAction || '—'}
                      {lead.nextActionDueAt
                        ? ` · ${new Date(lead.nextActionDueAt).toLocaleDateString()}`
                        : ''}
                    </td>
                    <td className="leads-table__actions-col leads-table__actions-col--wide">
                      <RowActionsCell
                        editHref={`/leads/${lead.id}#edit`}
                        whatsappHref={buildWhatsAppHref(lead.contactPhoneE164 ?? lead.contactPhone)}
                        emailHref={buildEmailHref(
                          lead.contactEmail,
                          `Re: ${lead.companyName || lead.contactName}`,
                        )}
                        moreItems={buildLeadActions(lead)}
                        canWrite={canWrite}
                      />
                    </td>
                  </StatusRowAccent>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
    {confirmDialog}
    <BulkCommunicationsReview
      open={bulkReviewChannel !== null}
      channel={bulkReviewChannel ?? 'email'}
      recipients={selectedLeads.map((lead) => ({
        id: lead.id,
        name: lead.companyName || lead.contactName,
        email: lead.contactEmail,
        phone: lead.contactPhoneE164 ?? lead.contactPhone,
      }))}
      onClose={() => setBulkReviewChannel(null)}
      onConfirmDrafts={() => {
        setBulkReviewChannel(null);
        setSelectedIds(new Set());
        void alert(
          'Drafts queued for review. Open each lead detail to approve outbound messages.',
          'Drafts created',
        );
      }}
    />
    <TypedDeleteDialog
      open={showBulkDelete}
      title="Delete leads permanently"
      message="Converted or job-linked leads will be blocked."
      count={selectedIds.size}
      pending={bulkSaving}
      onCancel={() => setShowBulkDelete(false)}
      onConfirm={() => void bulkDeleteConfirmed()}
    />
    </>
  );
}
