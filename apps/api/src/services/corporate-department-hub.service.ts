import type {
  CorporateDepartmentDetailResponse,
  CorporateDepartmentHubResponse,
  CorporateDepartmentId,
  DepartmentHubEntry,
  DepartmentTodayQueueItem,
  ExecutiveDashboardSummary,
  MissionControlModuleSnapshot,
} from '@titan/shared';
import {
  CORPORATE_DEPARTMENT_DISCLAIMER,
  CORPORATE_DEPARTMENTS,
  EXPECTED_CORPORATE_DEPARTMENT_COUNT,
  getCorporateDepartmentById,
  mapActionQueueItemToDepartments,
} from '@titan/shared';
import type { DashboardExecutiveService } from './dashboard-executive.service.js';
import type { EnterpriseMissionControlService } from './enterprise-mission-control.service.js';

type CorporateDepartmentHubServiceDeps = {
  dashboardExecutiveService: DashboardExecutiveService;
  enterpriseMissionControlService: EnterpriseMissionControlService;
  companyLabel?: string;
};

export class CorporateDepartmentHubService {
  constructor(private readonly deps: CorporateDepartmentHubServiceDeps) {}

  async getHub(companyId: string): Promise<CorporateDepartmentHubResponse> {
    const [executiveSummary, moduleSnapshots] = await Promise.all([
      this.deps.dashboardExecutiveService.getExecutiveSummary(companyId),
      this.deps.enterpriseMissionControlService.getMissionControlModuleSnapshots(companyId),
    ]);

    const departments = CORPORATE_DEPARTMENTS.map((definition) =>
      this.buildHubEntry(definition.id, executiveSummary, moduleSnapshots),
    );

    const actionQueueTotal = executiveSummary.priorities.actionQueue.length;

    return {
      generatedAt: new Date().toISOString(),
      companyLabel: this.deps.companyLabel ?? 'Young Guns Plumbing',
      departmentCount: EXPECTED_CORPORATE_DEPARTMENT_COUNT,
      departments,
      actionQueueTotal,
      disclaimer: CORPORATE_DEPARTMENT_DISCLAIMER,
    };
  }

  async getDepartmentDetail(
    companyId: string,
    departmentId: CorporateDepartmentId,
  ): Promise<CorporateDepartmentDetailResponse | null> {
    const definition = getCorporateDepartmentById(departmentId);
    if (!definition) return null;

    const [executiveSummary, moduleSnapshots] = await Promise.all([
      this.deps.dashboardExecutiveService.getExecutiveSummary(companyId),
      this.deps.enterpriseMissionControlService.getMissionControlModuleSnapshots(companyId),
    ]);

    const hubEntry = this.buildHubEntry(departmentId, executiveSummary, moduleSnapshots);

    return {
      ...hubEntry,
      weeklyRoutine: definition.weeklyRoutine,
      monthlyRoutine: definition.monthlyRoutine,
      approvals: definition.approvals,
      risks: definition.risks,
      kpis: definition.kpis,
      handoffs: definition.handoffs,
      auditNotes: definition.auditNotes,
    };
  }

  private buildHubEntry(
    departmentId: CorporateDepartmentId,
    executiveSummary: ExecutiveDashboardSummary,
    moduleSnapshots: MissionControlModuleSnapshot[],
  ): DepartmentHubEntry {
    const definition = getCorporateDepartmentById(departmentId)!;
    const todayQueue = this.buildTodayQueue(departmentId, executiveSummary, moduleSnapshots);
    const moduleMatch = this.resolveModuleHealth(definition.missionControlModules, moduleSnapshots);

    return {
      id: definition.id,
      label: definition.label,
      mandate: definition.mandate,
      accountableOwner: definition.accountableOwner,
      workspaceHref: definition.workspaceHref,
      manageRoutes: definition.manageRoutes,
      todayQueue,
      todayQueueEmpty: todayQueue.length === 0,
      queueSourceNote:
        todayQueue.length > 0
          ? 'Items from dashboard executive-summary and mission control — real records only.'
          : 'No actionable items in Today queue — check manage routes for operational context.',
      moduleHealthStatus: moduleMatch?.status ?? null,
      moduleHealthSummary: moduleMatch?.summary ?? null,
      weeklyRoutineCount: definition.weeklyRoutine.length,
      monthlyRoutineCount: definition.monthlyRoutine.length,
      approvalGateCount: definition.approvals.length,
    };
  }

  private buildTodayQueue(
    departmentId: CorporateDepartmentId,
    executiveSummary: ExecutiveDashboardSummary,
    moduleSnapshots: MissionControlModuleSnapshot[],
  ): DepartmentTodayQueueItem[] {
    const items: DepartmentTodayQueueItem[] = [];
    const seen = new Set<string>();

    for (const action of executiveSummary.priorities.actionQueue) {
      const targets = mapActionQueueItemToDepartments(action);
      if (!targets.includes(departmentId)) continue;
      if (seen.has(action.id)) continue;
      seen.add(action.id);
      items.push({
        id: action.id,
        title: action.title,
        description: action.description,
        count: action.count,
        href: action.href,
        priority: action.priority,
        source: 'executive_action_queue',
      });
    }

    this.appendGlanceItems(departmentId, executiveSummary, items, seen);
    this.appendMissionControlItems(departmentId, moduleSnapshots, items, seen);

    return items;
  }

  private appendGlanceItems(
    departmentId: CorporateDepartmentId,
    summary: ExecutiveDashboardSummary,
    items: DepartmentTodayQueueItem[],
    seen: Set<string>,
  ): void {
    const glance = summary.todayAtAGlance;

    const push = (id: string, item: DepartmentTodayQueueItem) => {
      if (seen.has(id)) return;
      seen.add(id);
      items.push(item);
    };

    if (departmentId === 'sales_business_development') {
      const count = glance.customerActivity.newLeads;
      if (count != null && count > 0) {
        push('glance-new-leads', {
          id: 'glance-new-leads',
          title: 'New leads today',
          description: 'Leads captured in CRM today.',
          count,
          href: '/leads',
          priority: 'normal',
          source: 'executive_glance',
        });
      }
    }

    if (departmentId === 'customer_experience') {
      const count = glance.customerActivity.unreadMessages;
      if (count != null && count > 0) {
        push('glance-unread-messages', {
          id: 'glance-unread-messages',
          title: 'Unread messages',
          description: 'Communications inbox needs attention.',
          count,
          href: '/communications/inbox',
          priority: 'normal',
          source: 'executive_glance',
        });
      }
    }

    if (departmentId === 'hr_workforce') {
      const count = glance.team.missingCheckIn;
      if (count > 0) {
        push('glance-missing-checkin', {
          id: 'glance-missing-checkin',
          title: 'Missing check-ins',
          description: 'Technicians without clock-in for scheduled work.',
          count,
          href: '/workforce/owner',
          priority: 'high',
          source: 'executive_glance',
        });
      }
    }

    if (departmentId === 'finance_accounting') {
      const draftCount = glance.money.draftCount;
      if (draftCount != null && draftCount > 0) {
        push('glance-draft-invoices', {
          id: 'glance-draft-invoices',
          title: 'Draft invoices',
          description: 'Invoices not yet sent or synced.',
          count: draftCount,
          href: '/finance/invoices',
          priority: 'normal',
          source: 'executive_glance',
        });
      }
    }

    if (departmentId === 'executive_strategy') {
      const critical = summary.priorities.criticalIssues.length;
      if (critical > 0) {
        push('glance-critical-issues', {
          id: 'glance-critical-issues',
          title: 'Critical issues',
          description: 'Overdue invoices and automation failures needing owner attention.',
          count: critical,
          href: '/',
          priority: 'critical',
          source: 'executive_glance',
        });
      }
    }
  }

  private appendMissionControlItems(
    departmentId: CorporateDepartmentId,
    moduleSnapshots: MissionControlModuleSnapshot[],
    items: DepartmentTodayQueueItem[],
    seen: Set<string>,
  ): void {
    const definition = getCorporateDepartmentById(departmentId);
    if (!definition) return;

    for (const moduleKey of definition.missionControlModules) {
      const snapshot = moduleSnapshots.find((row) => row.module === moduleKey);
      if (!snapshot) continue;
      if (snapshot.status !== 'attention_required' && snapshot.status !== 'critical') continue;

      const id = `mc-${moduleKey}`;
      if (seen.has(id)) continue;
      seen.add(id);

      const manageHref =
        typeof snapshot.metrics.manageHref === 'string'
          ? snapshot.metrics.manageHref
          : definition.manageRoutes[0];

      items.push({
        id,
        title: `${snapshot.module.replace(/_/g, ' ')} needs attention`,
        description: snapshot.summary,
        count: null,
        href: manageHref,
        priority: snapshot.status === 'critical' ? 'critical' : 'high',
        source: 'mission_control',
      });
    }
  }

  private resolveModuleHealth(
    modules: string[],
    snapshots: MissionControlModuleSnapshot[],
  ): MissionControlModuleSnapshot | null {
    for (const moduleKey of modules) {
      const match = snapshots.find((row) => row.module === moduleKey);
      if (match) return match;
    }
    return null;
  }
}
