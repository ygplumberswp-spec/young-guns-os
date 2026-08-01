import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import type { DayPlanFollowUpAction, DayPlanFollowUpItem } from '@titan/shared';
import { formatDayPlanDisplayDate, localPlanDateIso } from '@titan/shared';
import { Button } from '@titan/ui';
import { StatusBadge } from '../../components/ux/StatusBadge';
import { MoreMenu } from '../../components/ux/MoreMenu';
import { ApiClientError } from '../../lib/api-client';
import {
  applyDayPlanFollowUpAction,
  fetchDayPlanFollowUps,
} from '../../lib/intelligence-api';

type CustomerFollowUpsSectionProps = {
  accessToken: string;
  canWrite: boolean;
  planDate?: string;
};

const STATUS_LABELS: Record<DayPlanFollowUpItem['status'], string> = {
  draft: 'Draft recommendation',
  pending_review: 'Needs review',
  approved: 'Approved',
  declined: 'Declined',
  assigned: 'Assigned',
  completed: 'Completed',
};

const ACTION_LABELS: Record<DayPlanFollowUpAction, string> = {
  review: 'Review',
  edit: 'Edit',
  approve: 'Approve',
  decline: 'Decline',
  assign: 'Assign',
  complete: 'Complete',
};

export function CustomerFollowUpsSection({
  accessToken,
  canWrite,
  planDate: planDateProp,
}: CustomerFollowUpsSectionProps) {
  const planDate = useMemo(() => planDateProp ?? localPlanDateIso(), [planDateProp]);
  const [followUps, setFollowUps] = useState<DayPlanFollowUpItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingCustomerId, setWorkingCustomerId] = useState<string | null>(null);

  const loadFollowUps = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchDayPlanFollowUps(accessToken, planDate);
      setFollowUps(result.followUps);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to load customer follow-ups');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, planDate]);

  useEffect(() => {
    void loadFollowUps();
  }, [loadFollowUps]);

  async function runAction(customerId: string, action: DayPlanFollowUpAction) {
    if (!canWrite) {
      return;
    }

    setWorkingCustomerId(customerId);
    setError(null);

    try {
      const updated = await applyDayPlanFollowUpAction(
        accessToken,
        customerId,
        { action },
        planDate,
      );
      setFollowUps((current) =>
        current.map((item) => (item.customerId === customerId ? updated : item)),
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update follow-up');
    } finally {
      setWorkingCustomerId(null);
    }
  }

  return (
    <section className="day-plan-follow-ups" aria-label="Customer follow-ups">
      <div className="day-plan-follow-ups__header">
        <h3 className="day-planning__title">Customer follow-ups</h3>
        <p className="day-planning__date page-muted">{formatDayPlanDisplayDate(planDate)}</p>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {isLoading ? (
        <p className="page-muted">Loading customer follow-ups…</p>
      ) : followUps.length === 0 ? (
        <p className="page-muted">
          No customer follow-ups need attention today — items appear from real CRM activity only.
        </p>
      ) : (
        <ul className="day-plan-follow-ups__list">
          {followUps.map((item) => {
            const isWorking = workingCustomerId === item.customerId;
            const actions: DayPlanFollowUpAction[] =
              item.status === 'completed'
                ? []
                : item.status === 'draft' || item.status === 'pending_review'
                  ? ['review', 'approve', 'decline', 'assign']
                  : ['complete', 'edit'];

            return (
              <li key={item.customerId} className="day-plan-follow-ups__item">
                <div className="day-plan-follow-ups__item-main">
                  <div className="day-plan-follow-ups__item-head">
                    <Link href={`/crm/${item.customerId}`}>
                      <strong>{item.customerName}</strong>
                    </Link>
                    <StatusBadge
                      label={STATUS_LABELS[item.status]}
                      tone={
                        item.status === 'completed'
                          ? 'success'
                          : item.status === 'declined'
                            ? 'danger'
                            : item.isDraftRecommendation
                              ? 'neutral'
                              : 'warning'
                      }
                    />
                  </div>
                  <p className="day-plan-follow-ups__reason">{item.reason}</p>
                  <dl className="day-plan-follow-ups__meta">
                    <div>
                      <dt>Responsible agent</dt>
                      <dd>{item.responsibleAgent ?? 'Unassigned'}</dd>
                    </div>
                    <div>
                      <dt>Priority</dt>
                      <dd>{item.priority}</dd>
                    </div>
                    <div>
                      <dt>Next action</dt>
                      <dd>{item.nextAction ?? '—'}</dd>
                    </div>
                  </dl>
                  {item.mergedSourceCount > 1 ? (
                    <p className="page-muted day-plan-follow-ups__merged">
                      {item.mergedSourceCount} recommendations merged for this customer
                    </p>
                  ) : null}
                </div>

                {canWrite && actions.length > 0 ? (
                  <div className="day-plan-follow-ups__actions">
                    {actions.slice(0, 3).map((action) => (
                      <Button
                        key={action}
                        variant="secondary"
                        size="sm"
                        disabled={isWorking}
                        onClick={() => void runAction(item.customerId, action)}
                      >
                        {ACTION_LABELS[action]}
                      </Button>
                    ))}
                    {actions.length > 3 ? (
                      <MoreMenu
                        label="More follow-up actions"
                        items={actions.slice(3).map((action) => ({
                          id: action,
                          label: ACTION_LABELS[action],
                          onSelect: () => void runAction(item.customerId, action),
                        }))}
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
