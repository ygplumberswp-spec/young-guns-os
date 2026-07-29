import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Button, EmptyState, PageHeader, Panel, StatCard } from '@titan/ui';
import type { EnterpriseCustomerExperienceDashboard } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import {
  approveCustomerBooking,
  captureCustomerExperienceAnalytics,
  confirmCustomerBooking,
  fetchCustomerExperienceDashboard,
  updateCustomerExperiencePlatformConfig,
  updateCustomerReviewStatus,
} from '../../lib/enterprise-customer-experience-api-client';
import { useAuth } from '../../lib/auth-context';
import { AuraComposer } from '../../features/aura/AuraComposer';
import { AuraMessageList } from '../../features/aura/AuraMessageList';
import { AuraTaskApprovalCard } from '../../features/aura/AuraTaskApprovalCard';
import { useAuraChat } from '../../features/aura/useAuraChat';
import {
  canAccessCustomerExperience,
  canManageCustomerExperience,
  formatBookingStatus,
  formatReviewType,
} from '../../features/customer-experience/utils';

type CustomerExperienceTab = 'overview' | 'bookings' | 'reviews' | 'loyalty' | 'analytics' | 'settings' | 'assistant';

export function CustomerExperiencePage() {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<CustomerExperienceTab>('overview');
  const [dashboard, setDashboard] = useState<EnterpriseCustomerExperienceDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { agentMessages, isSending, pendingTasks, sendAgentMessage, updateTask, error: assistantError } =
    useAuraChat();

  const canView = useMemo(() => (user ? canAccessCustomerExperience(user.permissions) : false), [user]);
  const canWrite = useMemo(() => (user ? canManageCustomerExperience(user.permissions) : false), [user]);

  async function loadDashboard() {
    if (!accessToken) return;
    const data = await fetchCustomerExperienceDashboard(accessToken);
    setDashboard(data);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken || !canView) {
        setIsLoading(false);
        return;
      }
      try {
        const data = await fetchCustomerExperienceDashboard(accessToken);
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load customer experience dashboard');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, canView]);

  async function runAction(action: () => Promise<unknown>, message: string) {
    if (!accessToken) return;
    setIsWorking(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await loadDashboard();
      setSuccess(message);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Action failed');
    } finally {
      setIsWorking(false);
    }
  }

  if (!canView) {
    return (
      <div className="automation-page">
        <PageHeader title="Customer Experience" description="You do not have permission to view customer experience." />
      </div>
    );
  }

  const tabs: Array<{ id: CustomerExperienceTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'bookings', label: 'Bookings' },
    { id: 'reviews', label: 'Reviews & Feedback' },
    { id: 'loyalty', label: 'Loyalty & Referrals' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'settings', label: 'Platform Settings' },
    { id: 'assistant', label: 'AI Assistant' },
  ];

  return (
    <div className="automation-page">
      <PageHeader
        title="Customer Experience"
        description="Enterprise customer portal, bookings, documents, tracking, loyalty, and engagement. Real customer data only."
        actions={
          <div className="page-header-actions">
            <Link href="/settings/portal">
              <Button variant="secondary">Portal Settings</Button>
            </Link>
            {canWrite ? (
              <Button
                variant="secondary"
                disabled={isWorking}
                onClick={() => void runAction(() => captureCustomerExperienceAnalytics(accessToken!), 'Analytics captured')}
              >
                Capture analytics
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <div className="tab-row">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-button ${activeTab === tab.id ? 'tab-button--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Panel title="Loading">Loading customer experience dashboard…</Panel>
      ) : !dashboard ? (
        <EmptyState title="No data" description="Customer experience dashboard is unavailable." />
      ) : (
        <>
          {activeTab === 'overview' ? (
            <div className="stat-grid">
              <StatCard label="Portal users" value={String(dashboard.portalUserCount)} />
              <StatCard label="Active bookings" value={String(dashboard.activeBookingCount)} />
              <StatCard label="Pending approval" value={String(dashboard.pendingApprovalBookingCount)} />
              <StatCard label="Open reviews" value={String(dashboard.openReviewCount)} />
              <StatCard label="Referrals" value={String(dashboard.referralCount)} />
              <StatCard label="Loyalty programs" value={String(dashboard.loyaltyProgramCount)} />
              <StatCard label="Tracking" value={dashboard.trackingEnabled ? 'Enabled' : 'Disabled'} />
              <StatCard label="PWA" value={dashboard.pwaEnabled ? 'Enabled' : 'Disabled'} />
            </div>
          ) : null}

          {activeTab === 'bookings' ? (
            <Panel title="Appointment bookings" description="Draft → Approval → Confirmation workflow">
              {dashboard.recentBookings.length === 0 ? (
                <EmptyState title="No bookings" description="Bookings appear when customers submit requests through the portal." />
              ) : (
                <div className="data-list">
                  {dashboard.recentBookings.map((booking) => (
                    <div key={booking.id} className="data-list__item">
                      <div>
                        <strong>{booking.subject}</strong>
                        <p className="page-muted">
                          {formatBookingStatus(booking.status)} · {booking.bookingType}
                          {booking.preferredDate ? ` · ${booking.preferredDate}` : ''}
                        </p>
                      </div>
                      {canWrite && booking.status === 'pending_approval' ? (
                        <div className="page-header-actions">
                          <Button
                            size="sm"
                            disabled={isWorking}
                            onClick={() =>
                              void runAction(() => approveCustomerBooking(accessToken!, booking.id), 'Booking approved')
                            }
                          >
                            Approve
                          </Button>
                        </div>
                      ) : null}
                      {canWrite && (booking.status === 'approved' || booking.status === 'pending_approval') ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={isWorking}
                          onClick={() =>
                            void runAction(() => confirmCustomerBooking(accessToken!, booking.id), 'Booking confirmed')
                          }
                        >
                          Confirm
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'reviews' ? (
            <Panel title="Reviews & feedback" description="Customer-submitted ratings and feedback only">
              {dashboard.recentReviews.length === 0 ? (
                <EmptyState title="No reviews" description="Reviews appear when customers submit feedback through the portal." />
              ) : (
                <div className="data-list">
                  {dashboard.recentReviews.map((review) => (
                    <div key={review.id} className="data-list__item">
                      <div>
                        <strong>{review.subject}</strong>
                        <p className="page-muted">
                          {formatReviewType(review.reviewType)} · {review.status}
                          {review.rating != null ? ` · ${review.rating}/5` : ''}
                        </p>
                        <p>{review.feedback}</p>
                      </div>
                      {canWrite && review.status === 'submitted' ? (
                        <Button
                          size="sm"
                          disabled={isWorking}
                          onClick={() =>
                            void runAction(
                              () => updateCustomerReviewStatus(accessToken!, review.id, { status: 'acknowledged' }),
                              'Review acknowledged',
                            )
                          }
                        >
                          Acknowledge
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'loyalty' ? (
            <Panel title="Loyalty & referrals" description="Business-configurable loyalty tiers and referral tracking">
              <p className="page-muted">{dashboard.referralCount} referral(s) tracked.</p>
              {dashboard.recentReferrals.length === 0 ? (
                <EmptyState title="No referrals" description="Referrals appear when customers invite others through the portal." />
              ) : (
                <div className="data-list">
                  {dashboard.recentReferrals.map((referral) => (
                    <div key={referral.id} className="data-list__item">
                      <strong>{referral.referredEmail}</strong>
                      <p className="page-muted">{referral.status}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'analytics' ? (
            <Panel title="Customer analytics" description="Metrics from real portal and mobile activity only">
              <div className="stat-grid">
                <StatCard label="Portal usage" value={String(dashboard.analytics.portalUsageCount)} />
                <StatCard label="Mobile usage" value={String(dashboard.analytics.mobileUsageCount)} />
                <StatCard
                  label="Booking conversion"
                  value={
                    dashboard.analytics.bookingConversionRate != null
                      ? `${dashboard.analytics.bookingConversionRate.toFixed(1)}%`
                      : '—'
                  }
                />
                <StatCard
                  label="Satisfaction"
                  value={
                    dashboard.analytics.customerSatisfactionScore != null
                      ? dashboard.analytics.customerSatisfactionScore.toFixed(1)
                      : '—'
                  }
                />
              </div>
            </Panel>
          ) : null}

          {activeTab === 'settings' ? (
            <Panel title="Platform configuration" description="Tenant customer experience policies">
              <p className="page-muted">
                Tracking: {dashboard.trackingEnabled ? 'enabled' : 'disabled'} · PWA:{' '}
                {dashboard.pwaEnabled ? 'enabled' : 'disabled'} · Fleet:{' '}
                {dashboard.cartrackConnected ? 'connected' : 'not connected'}
              </p>
              {canWrite ? (
                <Button
                  variant="secondary"
                  disabled={isWorking}
                  onClick={() =>
                    void runAction(
                      () =>
                        updateCustomerExperiencePlatformConfig(accessToken!, {
                          trackingEnabled: !dashboard.trackingEnabled,
                        }),
                      'Platform settings updated',
                    )
                  }
                >
                  Toggle live tracking
                </Button>
              ) : null}
            </Panel>
          ) : null}

          {activeTab === 'assistant' ? (
            <Panel title="AURA Customer Experience Agent" description="Recommendations only — approval required for actions">
              {assistantError ? <p className="form-error">{assistantError}</p> : null}
              <AuraMessageList messages={agentMessages} isSending={isSending} />
              {pendingTasks.map((task) => (
                <AuraTaskApprovalCard key={task.id} task={task} accessToken={accessToken ?? ''} onUpdated={updateTask} />
              ))}
              <AuraComposer
                disabled={isSending}
                onSend={(content) => void sendAgentMessage(content, 'customer_experience' as import('@titan/shared').AgentKey)}
                placeholder="Ask about bookings, documents, tracking, loyalty, or customer engagement…"
              />
            </Panel>
          ) : null}
        </>
      )}
    </div>
  );
}
