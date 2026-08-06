import type { Recommendation, RecommendationsResponse } from '@titan/shared';
import { dedupeFollowUpRecommendations } from '@titan/shared';
import type { IntelligenceService } from './intelligence.service.js';

export class RecommendationsService {
  constructor(private readonly intelligenceService: IntelligenceService) {}

  async getRecommendations(companyId: string): Promise<RecommendationsResponse> {
    const dashboard = await this.intelligenceService.getDashboard(companyId);
    const recommendations: Recommendation[] = [];

    const followUpByCustomer = dedupeFollowUpRecommendations(
      dashboard.customerFollowUps.items.map((customer) => ({
        id: `follow-up-${customer.id}`,
        category: 'customer_follow_up' as const,
        priority:
          customer.daysSinceContact && customer.daysSinceContact > 30 ? ('high' as const) : ('medium' as const),
        title: `Follow up with ${customer.name}`,
        description: customer.lastActivityAt
          ? `No recent activity recorded. Last contact was ${customer.daysSinceContact ?? 'unknown'} days ago.`
          : 'No customer activity has been logged yet.',
        actionHint: 'Log a CRM activity or draft a WhatsApp message',
        entityType: 'customer',
        entityId: customer.id,
      })),
    );

    for (const recommendation of followUpByCustomer.values()) {
      recommendations.push(recommendation);
    }

    for (const invoice of dashboard.outstandingInvoices.items) {
      const outstanding = invoice.amountCents - invoice.amountPaidCents;
      recommendations.push({
        id: `invoice-${invoice.id}`,
        category: 'invoice_payment',
        priority: invoice.status === 'overdue' ? 'high' : 'medium',
        title: `Collect payment for ${invoice.invoiceNumber}`,
        description: `${invoice.customerName} owes ${formatCents(outstanding, dashboard.revenue.currency)} (${invoice.status}).`,
        actionHint: 'Draft a payment reminder or review invoice details',
        entityType: 'invoice',
        entityId: invoice.id,
      });
    }

    if (dashboard.lowStockCount > 0) {
      recommendations.push({
        id: 'inventory-low-stock',
        category: 'inventory',
        priority: 'medium',
        title: 'Review low stock items',
        description: `${dashboard.lowStockCount} inventory item${dashboard.lowStockCount === 1 ? '' : 's'} at or below reorder level.`,
        actionHint: 'Check inventory levels and reorder if needed',
        entityType: null,
        entityId: null,
      });
    }

    for (const vehicle of dashboard.fleetIssues.items) {
      recommendations.push({
        id: `fleet-${vehicle.id}`,
        category: 'fleet',
        priority: vehicle.status === 'out_of_service' ? 'high' : 'medium',
        title: `${vehicle.name} needs attention`,
        description: `Vehicle ${vehicle.licensePlate} is marked ${vehicle.status.replace('_', ' ')}.`,
        actionHint: 'Review fleet status and dispatch planning',
        entityType: 'vehicle',
        entityId: vehicle.id,
      });
    }

    if (dashboard.schedulingConflicts > 0) {
      recommendations.push({
        id: 'scheduling-conflicts',
        category: 'scheduling',
        priority: 'high',
        title: 'Resolve schedule conflicts',
        description: `${dashboard.schedulingConflicts} overlapping assignment${dashboard.schedulingConflicts === 1 ? '' : 's'} detected for technicians.`,
        actionHint: 'Review the dispatch calendar and reassign jobs',
        entityType: null,
        entityId: null,
      });
    }

    for (const failure of dashboard.automationFailures.items) {
      recommendations.push({
        id: `automation-${failure.id}`,
        category: 'automation',
        priority: 'medium',
        title: `Fix automation failure${failure.workflowName ? `: ${failure.workflowName}` : ''}`,
        description: failure.errorMessage ?? `Workflow run failed on ${failure.triggerEvent}.`,
        actionHint: 'Review workflow run history and retry or adjust the workflow',
        entityType: 'workflow_run',
        entityId: failure.id,
      });
    }

    if (dashboard.pendingApprovals.count > 0) {
      recommendations.push({
        id: 'pending-approvals',
        category: 'general',
        priority: 'high',
        title: 'Review pending approvals',
        description: `${dashboard.pendingApprovals.count} item${dashboard.pendingApprovals.count === 1 ? '' : 's'} waiting for your approval (${dashboard.pendingApprovals.agentTaskCount} agent, ${dashboard.pendingApprovals.workflowStepCount} workflow, ${dashboard.pendingApprovals.whatsappDraftCount} WhatsApp).`,
        actionHint: 'Open AURA or automation runs to approve or reject drafts',
        entityType: null,
        entityId: null,
      });
    }

    const priorityOrder = { high: 0, medium: 1, low: 2 };

    recommendations.sort(
      (left, right) => priorityOrder[left.priority] - priorityOrder[right.priority],
    );

    return {
      recommendations: recommendations.slice(0, 25),
      generatedAt: new Date().toISOString(),
    };
  }
}

function formatCents(amountCents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(amountCents / 100);
}
