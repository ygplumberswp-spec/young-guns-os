import type { ExecutiveOwnerActionItem } from './dashboard-executive.js';

/** Phase 13 — 19 corporate departments for Young Guns Plumbing operating model. */
export type CorporateDepartmentId =
  | 'executive_strategy'
  | 'finance_accounting'
  | 'sales_business_development'
  | 'marketing_growth'
  | 'customer_experience'
  | 'operations'
  | 'scheduling_dispatch'
  | 'projects_construction'
  | 'hr_workforce'
  | 'procurement'
  | 'inventory'
  | 'fleet_assets'
  | 'quality'
  | 'health_safety_compliance'
  | 'legal_risk_internal_control'
  | 'it_cybersecurity'
  | 'data_analytics'
  | 'administration'
  | 'aura_digital_workforce';

export type DepartmentAccountableOwner =
  | 'Company Owner'
  | 'Accountant'
  | 'Dispatcher'
  | 'Operations Manager';

export type DepartmentRoutineLink = {
  label: string;
  href: string;
  cadence: 'daily' | 'weekly' | 'monthly';
};

export type DepartmentApprovalGate = {
  id: string;
  label: string;
  href: string;
  note: string;
};

export type DepartmentRiskRegisterEntry = {
  id: string;
  risk: string;
  mitigation: string;
  owner: DepartmentAccountableOwner;
};

export type DepartmentKpiDefinition = {
  id: string;
  label: string;
  sourceRoute: string;
  sourceNote: string;
};

export type DepartmentHandoffDefinition = {
  toDepartmentId: CorporateDepartmentId;
  trigger: string;
  deliverable: string;
};

export type CorporateDepartmentDefinition = {
  id: CorporateDepartmentId;
  label: string;
  mandate: string;
  accountableOwner: DepartmentAccountableOwner;
  workspaceHref: string;
  manageRoutes: string[];
  actionQueueCategories: string[];
  actionQueueIds: string[];
  missionControlModules: string[];
  weeklyRoutine: DepartmentRoutineLink[];
  monthlyRoutine: DepartmentRoutineLink[];
  approvals: DepartmentApprovalGate[];
  risks: DepartmentRiskRegisterEntry[];
  kpis: DepartmentKpiDefinition[];
  handoffs: DepartmentHandoffDefinition[];
  auditNotes: string[];
  requiredPermissions: string[];
};

export type DepartmentTodayQueueItem = {
  id: string;
  title: string;
  description: string;
  count: number | null;
  href: string;
  priority: ExecutiveOwnerActionItem['priority'];
  source:
    | 'executive_action_queue'
    | 'executive_glance'
    | 'mission_control'
    | 'department_routine_task';
  /** Present when source is department_routine_task. */
  taskId?: string;
  taskStatus?: string;
  dueDate?: string;
  accountableOwner?: DepartmentAccountableOwner;
  cadence?: 'daily' | 'weekly' | 'monthly';
  requiresApproval?: boolean;
};

export type DepartmentHubEntry = {
  id: CorporateDepartmentId;
  label: string;
  mandate: string;
  accountableOwner: DepartmentAccountableOwner;
  workspaceHref: string;
  manageRoutes: string[];
  todayQueue: DepartmentTodayQueueItem[];
  todayQueueEmpty: boolean;
  queueSourceNote: string;
  moduleHealthStatus: string | null;
  moduleHealthSummary: string | null;
  weeklyRoutineCount: number;
  monthlyRoutineCount: number;
  approvalGateCount: number;
};

export type CorporateDepartmentHubResponse = {
  generatedAt: string;
  companyLabel: string;
  departmentCount: number;
  departments: DepartmentHubEntry[];
  actionQueueTotal: number;
  disclaimer: string;
};

export type CorporateDepartmentDetailResponse = DepartmentHubEntry & {
  weeklyRoutine: DepartmentRoutineLink[];
  monthlyRoutine: DepartmentRoutineLink[];
  approvals: DepartmentApprovalGate[];
  risks: DepartmentRiskRegisterEntry[];
  kpis: DepartmentKpiDefinition[];
  handoffs: DepartmentHandoffDefinition[];
  auditNotes: string[];
};

export const CORPORATE_DEPARTMENT_DISCLAIMER =
  'Today queues show real tenant records only. Empty queues mean no actionable items — not a system fault.';

export const CORPORATE_DEPARTMENTS: CorporateDepartmentDefinition[] = [
  {
    id: 'executive_strategy',
    label: 'Executive & Strategy',
    mandate:
      'Set direction, prioritise capital and capacity, and resolve cross-department escalations for Young Guns Plumbing.',
    accountableOwner: 'Company Owner',
    workspaceHref: '/departments/executive_strategy',
    manageRoutes: ['/', '/mission-control', '/aura/todays-plan'],
    actionQueueCategories: ['Approvals'],
    actionQueueIds: ['approvals-waiting'],
    missionControlModules: ['executive', 'business_evolution'],
    weeklyRoutine: [
      { label: 'Review Company Health', href: '/mission-control', cadence: 'weekly' },
      { label: "Review AURA Today's Plan", href: '/aura/todays-plan', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Executive dashboard money vs jobs trend', href: '/analytics', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'cross-dept-escalation',
        label: 'Cross-department escalations',
        href: '/aura/todays-plan',
        note: 'Owner decision on blocked workflows and AURA drafts.',
      },
    ],
    risks: [
      {
        id: 'owner-bottleneck',
        risk: 'Owner becomes single approval gate',
        mitigation: 'Document delegation matrix in Team & Access; use RACI for recurring decisions',
        owner: 'Company Owner',
      },
    ],
    kpis: [
      {
        id: 'priorities-today',
        label: 'Priorities in owner action queue',
        sourceRoute: '/',
        sourceNote: 'From dashboard executive-summary priorities.actionQueue',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'finance_accounting',
        trigger: 'Cash or margin concern flagged on dashboard',
        deliverable: 'Finance review of receivables and cashflow',
      },
    ],
    auditNotes: ['Owner action centre items trace to dashboard executive-summary API.'],
    requiredPermissions: ['executive:read', '*'],
  },
  {
    id: 'finance_accounting',
    label: 'Finance & Accounting',
    mandate: 'Protect cash, reconcile Xero-backed records, and ensure completed work is invoiced and collected.',
    accountableOwner: 'Accountant',
    workspaceHref: '/departments/finance_accounting',
    manageRoutes: [
      '/finance/receivables',
      '/finance/payables',
      '/finance/cashflow',
      '/finance/invoices',
      '/finance/payments',
    ],
    actionQueueCategories: ['Finance'],
    actionQueueIds: ['overdue-invoices', 'completed-not-invoiced'],
    missionControlModules: ['finance'],
    weeklyRoutine: [
      { label: 'Receivables aging review', href: '/finance/receivables', cadence: 'weekly' },
      { label: 'Cashflow MTD check', href: '/finance/cashflow', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Payables and PO commitments', href: '/finance/payables', cadence: 'monthly' },
      { label: 'Xero sync health', href: '/integrations', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'accpay-import',
        label: 'Xero ACCPAY bills import',
        href: '/finance/payables',
        note: 'HOLD — Owner approval required before supplier bill import.',
      },
    ],
    risks: [
      {
        id: 'accpay-hold',
        risk: 'Payables blind spot until ACCPAY import approved',
        mitigation: 'Track PO commitments; escalate overdue supplier terms to Owner',
        owner: 'Accountant',
      },
    ],
    kpis: [
      {
        id: 'overdue-receivables',
        label: 'Overdue invoice balance',
        sourceRoute: '/finance/receivables',
        sourceNote: 'Xero-backed outstanding invoices with due date passed',
      },
      {
        id: 'cash-received-mtd',
        label: 'Cash received MTD',
        sourceRoute: '/finance/cashflow',
        sourceNote: 'Payment records — separate from invoiced revenue',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'sales_business_development',
        trigger: 'Disputed invoice or quote mismatch',
        deliverable: 'Sales confirms scope with customer before credit note',
      },
    ],
    auditNotes: ['Never mix invoiced revenue and cash received on the same metric without labelling.'],
    requiredPermissions: ['finance:read', 'executive:read', '*'],
  },
  {
    id: 'sales_business_development',
    label: 'Sales & Business Development',
    mandate: 'Convert leads to quoted work, protect pipeline quality, and hand off won jobs to operations.',
    accountableOwner: 'Company Owner',
    workspaceHref: '/departments/sales_business_development',
    manageRoutes: ['/leads', '/crm', '/finance/quotes'],
    actionQueueCategories: ['Sales'],
    actionQueueIds: ['quotes-awaiting'],
    missionControlModules: ['sales', 'sales_intelligence', 'customers', 'crm'],
    weeklyRoutine: [
      { label: 'Pipeline and lead follow-up', href: '/leads', cadence: 'weekly' },
      { label: 'Quotes awaiting action', href: '/finance/quotes', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Customer value and repeat business', href: '/analytics', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'quote-discount',
        label: 'Discounted or non-standard quotes',
        href: '/finance/quotes',
        note: 'Owner approval on margin exceptions.',
      },
    ],
    risks: [
      {
        id: 'quote-ops-gap',
        risk: 'Quoted scope differs from field execution',
        mitigation: 'Link accepted quotes to jobs; BOQ for project work',
        owner: 'Company Owner',
      },
    ],
    kpis: [
      {
        id: 'pending-quotes',
        label: 'Quotes awaiting action',
        sourceRoute: '/finance/quotes',
        sourceNote: 'From executive action queue when count > 0',
      },
      {
        id: 'new-leads-today',
        label: 'New leads today',
        sourceRoute: '/leads',
        sourceNote: 'From dashboard todayAtAGlance.customerActivity.newLeads',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'scheduling_dispatch',
        trigger: 'Quote accepted / job created',
        deliverable: 'Scheduled job with assigned technician',
      },
    ],
    auditNotes: ['CRM follow-ups surface in executive action queue when due.'],
    requiredPermissions: ['leads:read', 'customers:read', 'finance:read', '*'],
  },
  {
    id: 'marketing_growth',
    label: 'Marketing & Growth',
    mandate: 'Drive qualified demand, protect brand, and respect marketing consent on all outbound activity.',
    accountableOwner: 'Company Owner',
    workspaceHref: '/departments/marketing_growth',
    manageRoutes: ['/marketing', '/analytics'],
    actionQueueCategories: [],
    actionQueueIds: [],
    missionControlModules: ['marketing_intelligence', 'marketing'],
    weeklyRoutine: [
      { label: 'Campaign and channel review', href: '/marketing', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Attribution and lead source quality', href: '/analytics', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'marketing-send',
        label: 'Bulk marketing send',
        href: '/marketing',
        note: 'Owner approval required before publish/spend (master directive gate).',
      },
    ],
    risks: [
      {
        id: 'consent-gap',
        risk: 'Contacting customers without valid consent',
        mitigation: 'Use marketing eligibility checks before campaigns',
        owner: 'Company Owner',
      },
    ],
    kpis: [
      {
        id: 'new-leads',
        label: 'New leads (operational proxy for demand)',
        sourceRoute: '/leads',
        sourceNote: 'No fake campaign KPIs — leads from CRM records only',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'sales_business_development',
        trigger: 'Marketing-qualified lead captured',
        deliverable: 'Lead record with source attribution in CRM',
      },
    ],
    auditNotes: ['No synthetic campaign scores — use CRM lead counts and analytics when connected.'],
    requiredPermissions: ['marketing:read', '*'],
  },
  {
    id: 'customer_experience',
    label: 'Customer Experience',
    mandate: 'Respond on time, resolve complaints, and maintain trust across WhatsApp, email, and phone touchpoints.',
    accountableOwner: 'Operations Manager',
    workspaceHref: '/departments/customer_experience',
    manageRoutes: ['/communications/inbox', '/communications/messages', '/crm'],
    actionQueueCategories: ['Customers'],
    actionQueueIds: ['customer-follow-ups'],
    missionControlModules: ['customers', 'communications'],
    weeklyRoutine: [
      { label: 'Inbox and unread messages', href: '/communications/inbox', cadence: 'weekly' },
      { label: 'CRM follow-ups', href: '/crm', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Complaint and escalation review', href: '/communications/messages', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'whatsapp-draft',
        label: 'WhatsApp outbound drafts',
        href: '/communications/messages',
        note: 'Approval-gated sends via communications workspace.',
      },
    ],
    risks: [
      {
        id: 'slow-response',
        risk: 'Unread messages erode trust',
        mitigation: 'Daily inbox sweep; link jobs to customer threads',
        owner: 'Operations Manager',
      },
    ],
    kpis: [
      {
        id: 'follow-ups-due',
        label: 'Customer follow-ups due',
        sourceRoute: '/crm',
        sourceNote: 'Executive action queue customer-follow-ups when count > 0',
      },
      {
        id: 'unread-messages',
        label: 'Unread messages',
        sourceRoute: '/communications/inbox',
        sourceNote: 'From dashboard todayAtAGlance.customerActivity.unreadMessages',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'operations',
        trigger: 'Customer reports service issue on active job',
        deliverable: 'Job note and dispatch reassignment if needed',
      },
    ],
    auditNotes: ['complaintsEscalations metric is null on staging until complaint taxonomy is wired.'],
    requiredPermissions: ['communications:read', 'customers:read', '*'],
  },
  {
    id: 'operations',
    label: 'Operations',
    mandate: 'Deliver plumbing services on time, safely, and to quoted scope across Gauteng field teams.',
    accountableOwner: 'Operations Manager',
    workspaceHref: '/departments/operations',
    manageRoutes: ['/jobs', '/mobile-platform/dispatcher'],
    actionQueueCategories: ['Operations'],
    actionQueueIds: ['delayed-jobs'],
    missionControlModules: ['jobs', 'service_delivery', 'operations'],
    weeklyRoutine: [
      { label: "Today's jobs and delays", href: '/jobs?filter=today', cadence: 'weekly' },
      { label: 'Live dispatch board', href: '/mobile-platform/dispatcher', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Job completion and rework patterns', href: '/analytics', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'job-variation',
        label: 'Scope variation on site',
        href: '/jobs',
        note: 'Owner approval when variation affects invoice total.',
      },
    ],
    risks: [
      {
        id: 'delayed-jobs',
        risk: 'SLA breach on scheduled starts',
        mitigation: 'Monitor delayed jobs queue; reassign via dispatch',
        owner: 'Operations Manager',
      },
    ],
    kpis: [
      {
        id: 'delayed-today',
        label: 'Delayed jobs today',
        sourceRoute: '/jobs?filter=delayed',
        sourceNote: 'Executive action queue and todayAtAGlance.jobs.delayed',
      },
      {
        id: 'completed-today',
        label: 'Jobs completed today',
        sourceRoute: '/jobs?filter=today',
        sourceNote: 'From dashboard executive-summary completedToday',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'finance_accounting',
        trigger: 'Job marked complete',
        deliverable: 'Invoice draft or link from job finance workflow',
      },
    ],
    auditNotes: ['Live operations panel on owner dashboard mirrors in-progress jobs.'],
    requiredPermissions: ['jobs:read', 'dispatch:read', '*'],
  },
  {
    id: 'scheduling_dispatch',
    label: 'Scheduling & Dispatch',
    mandate: 'Assign the right technician to the right job with realistic travel and capacity.',
    accountableOwner: 'Dispatcher',
    workspaceHref: '/departments/scheduling_dispatch',
    manageRoutes: ['/scheduling', '/mobile-platform/dispatcher'],
    actionQueueCategories: ['Scheduling'],
    actionQueueIds: ['unassigned-jobs', 'scheduling-conflicts'],
    missionControlModules: ['dispatch', 'scheduling'],
    weeklyRoutine: [
      { label: 'Tomorrow capacity plan', href: '/scheduling', cadence: 'weekly' },
      { label: 'Conflict review', href: '/scheduling', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Utilisation vs leave calendar', href: '/workforce-intelligence', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'overtime-dispatch',
        label: 'After-hours dispatch',
        href: '/scheduling',
        note: 'Owner approval for non-standard overtime call-outs.',
      },
    ],
    risks: [
      {
        id: 'unassigned-today',
        risk: 'Unassigned jobs same-day',
        mitigation: 'Critical priority in owner action queue',
        owner: 'Dispatcher',
      },
    ],
    kpis: [
      {
        id: 'unassigned',
        label: 'Unassigned jobs today',
        sourceRoute: '/scheduling',
        sourceNote: 'Executive action queue unassigned-jobs',
      },
      {
        id: 'conflicts',
        label: 'Scheduling conflicts',
        sourceRoute: '/scheduling',
        sourceNote: 'Executive action queue scheduling-conflicts',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'fleet_assets',
        trigger: 'Technician needs vehicle swap',
        deliverable: 'Updated vehicle assignment on fleet records',
      },
    ],
    auditNotes: ['Scheduling conflicts counted from intelligence dashboard — honest zero when none.'],
    requiredPermissions: ['dispatch:read', 'scheduling:read', '*'],
  },
  {
    id: 'projects_construction',
    label: 'Projects & Construction',
    mandate: 'Manage multi-day plumbing projects, BOQs, and site progress with documented handover packs.',
    accountableOwner: 'Company Owner',
    workspaceHref: '/departments/projects_construction',
    manageRoutes: ['/finance/boq', '/jobs', '/documents/job-packs'],
    actionQueueCategories: [],
    actionQueueIds: [],
    missionControlModules: ['jobs', 'service_delivery'],
    weeklyRoutine: [
      { label: 'Active project jobs', href: '/jobs', cadence: 'weekly' },
      { label: 'BOQ vs actual review', href: '/finance/boq', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Job pack completeness', href: '/documents/job-packs', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'boq-variation',
        label: 'BOQ variation',
        href: '/finance/boq',
        note: 'Owner sign-off before customer variation invoice.',
      },
    ],
    risks: [
      {
        id: 'boq-drift',
        risk: 'Field materials exceed BOQ without approval',
        mitigation: 'Parts requests linked to project jobs',
        owner: 'Company Owner',
      },
    ],
    kpis: [
      {
        id: 'open-boqs',
        label: 'Open BOQs',
        sourceRoute: '/finance/boq',
        sourceNote: 'From finance BOQ list — no synthetic progress scores',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'procurement',
        trigger: 'Project materials shortfall',
        deliverable: 'Purchase order or parts request',
      },
    ],
    auditNotes: ['Project-type jobs identified via jobs list filters — no fake completion percentages.'],
    requiredPermissions: ['jobs:read', 'finance:read', 'documents:read', '*'],
  },
  {
    id: 'hr_workforce',
    label: 'HR & Workforce',
    mandate: 'Roster capacity, timesheets, certifications, and Young Guns payroll preparation with audit trail.',
    accountableOwner: 'Company Owner',
    workspaceHref: '/departments/hr_workforce',
    manageRoutes: ['/workforce/owner', '/workforce-intelligence', '/settings/team'],
    actionQueueCategories: [],
    actionQueueIds: [],
    missionControlModules: ['workforce', 'technicians'],
    weeklyRoutine: [
      { label: 'Owner workforce attendance', href: '/workforce/owner', cadence: 'weekly' },
      { label: 'Certification expiries', href: '/workforce/owner', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Payroll preparation review', href: '/workforce-intelligence', cadence: 'monthly' },
      { label: 'Team access audit', href: '/settings/team', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'payroll-batch',
        label: 'Payroll preparation batch',
        href: '/workforce-intelligence',
        note: 'Owner approval before export to payroll provider.',
      },
      {
        id: 'timesheet-correction',
        label: 'Timesheet corrections',
        href: '/workforce-intelligence',
        note: 'Audited via workforce intelligence correction trail.',
      },
    ],
    risks: [
      {
        id: 'sparse-clocks',
        risk: 'Missing clock pairs distort hours',
        mitigation: 'Owner workforce flags missing timesheets; mobile time entry for techs',
        owner: 'Company Owner',
      },
    ],
    kpis: [
      {
        id: 'missing-checkin',
        label: 'Missing check-ins today',
        sourceRoute: '/workforce/owner',
        sourceNote: 'From dashboard todayAtAGlance.team.missingCheckIn',
      },
      {
        id: 'payroll-rules',
        label: 'Young Guns payroll rules applied',
        sourceRoute: '/workforce/owner',
        sourceNote: '07:00–17:00, 30-min lunch, OT rules from owner-workforce API',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'finance_accounting',
        trigger: 'Payroll batch approved',
        deliverable: 'Labour cost accrual for finance review',
      },
    ],
    auditNotes: ['Phase 12 owner-workforce API — honest empty when roster sparse on staging.'],
    requiredPermissions: ['workforce:read', 'workforce:write', '*'],
  },
  {
    id: 'procurement',
    label: 'Procurement',
    mandate: 'Source parts and supplier terms; convert parts requests to POs without stock-outs.',
    accountableOwner: 'Company Owner',
    workspaceHref: '/departments/procurement',
    manageRoutes: ['/procurement', '/procurement/parts-requests', '/procurement/purchase-orders'],
    actionQueueCategories: [],
    actionQueueIds: [],
    missionControlModules: ['inventory', 'procurement'],
    weeklyRoutine: [
      { label: 'Open parts requests', href: '/procurement/parts-requests', cadence: 'weekly' },
      { label: 'PO status', href: '/procurement/purchase-orders', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Supplier performance', href: '/procurement/suppliers', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'po-threshold',
        label: 'Purchase orders above threshold',
        href: '/procurement/purchase-orders',
        note: 'Owner approval on high-value POs.',
      },
    ],
    risks: [
      {
        id: 'emergency-buy',
        risk: 'Emergency buys bypass PO process',
        mitigation: 'Retroactive PO within 24h; link to job costing',
        owner: 'Company Owner',
      },
    ],
    kpis: [
      {
        id: 'open-pos',
        label: 'Open purchase orders',
        sourceRoute: '/procurement/purchase-orders',
        sourceNote: 'From procurement list — PO commitments also on payables HOLD view',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'inventory',
        trigger: 'PO received',
        deliverable: 'Stock movement and updated on-hand qty',
      },
    ],
    auditNotes: ['Procurement nav hidden unless procurement:read — direct URL when enabled.'],
    requiredPermissions: ['procurement:read', 'inventory:read', '*'],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    mandate: 'Maintain van and warehouse stock levels so jobs are not blocked waiting for parts.',
    accountableOwner: 'Operations Manager',
    workspaceHref: '/departments/inventory',
    manageRoutes: ['/inventory/products', '/inventory/stock', '/inventory/movements'],
    actionQueueCategories: ['Inventory'],
    actionQueueIds: ['stock-blockers'],
    missionControlModules: ['inventory'],
    weeklyRoutine: [
      { label: 'Low stock review', href: '/inventory/stock', cadence: 'weekly' },
      { label: 'Recent movements', href: '/inventory/movements', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Stock take reconciliation', href: '/inventory/stock', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'write-off',
        label: 'Stock write-off',
        href: '/inventory/movements',
        note: 'Owner approval on material write-offs.',
      },
    ],
    risks: [
      {
        id: 'low-stock-block',
        risk: 'Low stock blocks emergency call-outs',
        mitigation: 'Surfaces in executive action queue when count > 0',
        owner: 'Operations Manager',
      },
    ],
    kpis: [
      {
        id: 'low-stock-count',
        label: 'Low stock items',
        sourceRoute: '/inventory/stock',
        sourceNote: 'Executive action queue stock-blockers',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'procurement',
        trigger: 'Stock below minimum',
        deliverable: 'Parts request or PO draft',
      },
    ],
    auditNotes: ['Low stock count from intelligence dashboard — zero is valid.'],
    requiredPermissions: ['inventory:read', '*'],
  },
  {
    id: 'fleet_assets',
    label: 'Fleet & Assets',
    mandate: 'Keep Young Guns vehicles roadworthy, tracked via Cartrack, and assigned to active technicians.',
    accountableOwner: 'Operations Manager',
    workspaceHref: '/departments/fleet_assets',
    manageRoutes: ['/fleet', '/fleet/live-map', '/fleet/alerts', '/fleet/maintenance'],
    actionQueueCategories: ['Fleet'],
    actionQueueIds: ['fleet-alerts'],
    missionControlModules: ['fleet'],
    weeklyRoutine: [
      { label: 'Fleet alerts', href: '/fleet/alerts', cadence: 'weekly' },
      { label: 'Live map check', href: '/fleet/live-map', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Maintenance schedule', href: '/fleet/maintenance', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'vehicle-off-road',
        label: 'Vehicle off-road > 48h',
        href: '/fleet/vehicles',
        note: 'Owner approval for extended hire or replacement.',
      },
    ],
    risks: [
      {
        id: 'cartrack-gap',
        risk: 'GPS stale vs actual location',
        mitigation: 'Review fleet alerts; cross-check live map',
        owner: 'Operations Manager',
      },
    ],
    kpis: [
      {
        id: 'fleet-issues',
        label: 'Fleet alerts / issues',
        sourceRoute: '/fleet/alerts',
        sourceNote: 'Executive action queue fleet-alerts',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'scheduling_dispatch',
        trigger: 'Vehicle unavailable',
        deliverable: 'Revised dispatch plan without affected vehicle',
      },
    ],
    auditNotes: ['Cartrack integration state on staging — truthful provider status in integrations.'],
    requiredPermissions: ['fleet:read', '*'],
  },
  {
    id: 'quality',
    label: 'Quality',
    mandate: 'Verify workmanship standards, callbacks, and documentation quality on completed jobs.',
    accountableOwner: 'Operations Manager',
    workspaceHref: '/departments/quality',
    manageRoutes: ['/documents/job-packs', '/jobs'],
    actionQueueCategories: [],
    actionQueueIds: [],
    missionControlModules: ['service_delivery', 'jobs'],
    weeklyRoutine: [
      { label: 'Completed job pack review', href: '/documents/job-packs', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Callback job analysis', href: '/jobs', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'quality-hold',
        label: 'Release job pack to customer',
        href: '/documents/job-packs',
        note: 'Supervisor sign-off when COC required.',
      },
    ],
    risks: [
      {
        id: 'missing-coc',
        risk: 'Compliance certificate missing on regulated work',
        mitigation: 'Job pack checklist before invoice',
        owner: 'Operations Manager',
      },
    ],
    kpis: [
      {
        id: 'job-packs',
        label: 'Job packs pending review',
        sourceRoute: '/documents/job-packs',
        sourceNote: 'From documents job-packs list — no synthetic quality scores',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'health_safety_compliance',
        trigger: 'Regulated install completed',
        deliverable: 'COC and compliance documents in job pack',
      },
    ],
    auditNotes: ['No fake QA scores — use job pack and document records only.'],
    requiredPermissions: ['documents:read', 'jobs:read', '*'],
  },
  {
    id: 'health_safety_compliance',
    label: 'Health Safety & Compliance',
    mandate: 'Protect people on site; maintain COHS-aligned practices and job-site safety documentation.',
    accountableOwner: 'Company Owner',
    workspaceHref: '/departments/health_safety_compliance',
    manageRoutes: ['/documents/compliance', '/security'],
    actionQueueCategories: [],
    actionQueueIds: [],
    missionControlModules: ['security', 'legal_compliance'],
    weeklyRoutine: [
      { label: 'Compliance workspace', href: '/documents/compliance', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Safety document review', href: '/documents/compliance', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'incident-report',
        label: 'Incident report filing',
        href: '/documents/compliance',
        note: 'Owner notified on recordable incidents.',
      },
    ],
    risks: [
      {
        id: 'site-hazard',
        risk: 'Unreported site hazards',
        mitigation: 'Technician mobile documents upload; compliance workspace review',
        owner: 'Company Owner',
      },
    ],
    kpis: [
      {
        id: 'compliance-docs',
        label: 'Compliance documents on file',
        sourceRoute: '/documents/compliance',
        sourceNote: 'From compliance workspace — count from real document records',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'legal_risk_internal_control',
        trigger: 'Regulatory inquiry or incident',
        deliverable: 'Document bundle and timeline',
      },
    ],
    auditNotes: ['Mission control security/legal modules reflect audit readiness signals.'],
    requiredPermissions: ['documents:read', 'security:read', '*'],
  },
  {
    id: 'legal_risk_internal_control',
    label: 'Legal Risk & Internal Control',
    mandate: 'Contracts, POPIA, insurance, and internal control over financial and operational commitments.',
    accountableOwner: 'Company Owner',
    workspaceHref: '/departments/legal_risk_internal_control',
    manageRoutes: ['/documents/compliance', '/settings/advanced/data-protection'],
    actionQueueCategories: [],
    actionQueueIds: [],
    missionControlModules: ['legal_compliance', 'security'],
    weeklyRoutine: [
      { label: 'Data protection settings', href: '/settings/advanced/data-protection', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Contract and policy review', href: '/documents/compliance', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'legal-commitment',
        label: 'Legal or employment commitments',
        href: '/documents/compliance',
        note: 'Prohibited for AURA tenant capabilities without Owner sign-off.',
      },
    ],
    risks: [
      {
        id: 'popia-breach',
        risk: 'Customer PII exposed in comms exports',
        mitigation: 'RBAC on documents and communications; data protection settings',
        owner: 'Company Owner',
      },
    ],
    kpis: [
      {
        id: 'pending-approvals',
        label: 'Control exceptions awaiting approval',
        sourceRoute: '/aura/todays-plan',
        sourceNote: 'Cross-ref approvals-waiting in executive queue',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'administration',
        trigger: 'Policy update approved',
        deliverable: 'Published team policy in settings/documents',
      },
    ],
    auditNotes: ['Tenant capability builder prohibits legal commitments without approval.'],
    requiredPermissions: ['security:read', 'documents:read', 'executive:read', '*'],
  },
  {
    id: 'it_cybersecurity',
    label: 'IT & Cybersecurity',
    mandate: 'Secure TITAN access, integrations, and tenant data; maintain truthful integration health.',
    accountableOwner: 'Company Owner',
    workspaceHref: '/departments/it_cybersecurity',
    manageRoutes: ['/integrations', '/security', '/settings/advanced/platform-health'],
    actionQueueCategories: [],
    actionQueueIds: [],
    missionControlModules: ['integrations', 'it_operations', 'platform_health', 'security'],
    weeklyRoutine: [
      { label: 'Integration connection status', href: '/integrations', cadence: 'weekly' },
      { label: 'Security overview', href: '/security', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Platform health (advanced)', href: '/settings/advanced/platform-health', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'integration-oauth',
        label: 'New integration OAuth',
        href: '/integrations',
        note: 'Owner approval for new provider connections.',
      },
    ],
    risks: [
      {
        id: 'credential-rot',
        risk: 'Stale integration credentials',
        mitigation: 'Weekly integrations review; sync job failures in mission control',
        owner: 'Company Owner',
      },
    ],
    kpis: [
      {
        id: 'integration-health',
        label: 'Integration sync failures',
        sourceRoute: '/integrations',
        sourceNote: 'From integration sync jobs and mission control modules',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'finance_accounting',
        trigger: 'Xero sync failure',
        deliverable: 'Finance notified; read-only mode until resolved',
      },
    ],
    auditNotes: ['Xero read-only on staging — no write without explicit approval gates.'],
    requiredPermissions: ['integrations:read', 'security:read', '*'],
  },
  {
    id: 'data_analytics',
    label: 'Data & Analytics',
    mandate: 'Provide decision-ready views from real tenant data — no synthetic KPIs or demo dashboards.',
    accountableOwner: 'Company Owner',
    workspaceHref: '/departments/data_analytics',
    manageRoutes: ['/analytics', '/mission-control'],
    actionQueueCategories: [],
    actionQueueIds: [],
    missionControlModules: ['business_intelligence', 'analytics'],
    weeklyRoutine: [
      { label: 'Analytics overview', href: '/analytics', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Company health module review', href: '/mission-control', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'external-export',
        label: 'Bulk data export',
        href: '/settings/advanced/data-protection',
        note: 'Owner approval on sensitive exports.',
      },
    ],
    risks: [
      {
        id: 'misleading-aggregate',
        risk: 'Mixed metrics misread (invoiced vs cash)',
        mitigation: 'Finance labels enforced in Phase 3 reports',
        owner: 'Company Owner',
      },
    ],
    kpis: [
      {
        id: 'analytics-access',
        label: 'Analytics modules available',
        sourceRoute: '/analytics',
        sourceNote: 'Real charts from tenant DB — empty when insufficient history',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'executive_strategy',
        trigger: 'Monthly business review',
        deliverable: 'Analytics snapshot for owner decision session',
      },
    ],
    auditNotes: ['Analytics empty states are honest — not back-filled with demo data.'],
    requiredPermissions: ['analytics:read', 'intelligence:read', '*'],
  },
  {
    id: 'administration',
    label: 'Administration',
    mandate: 'Company profile, billing, team access, notifications, and records management.',
    accountableOwner: 'Company Owner',
    workspaceHref: '/departments/administration',
    manageRoutes: ['/settings', '/settings/team', '/settings/billing', '/settings/documents-records'],
    actionQueueCategories: [],
    actionQueueIds: [],
    missionControlModules: ['saas_management'],
    weeklyRoutine: [
      { label: 'Team & access review', href: '/settings/team', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Billing and subscription', href: '/settings/billing', cadence: 'monthly' },
      { label: 'Documents & records policy', href: '/settings/documents-records', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'role-change',
        label: 'Role and permission changes',
        href: '/settings/team',
        note: 'Owner approval on elevated roles.',
      },
    ],
    risks: [
      {
        id: 'over-privileged',
        risk: 'Excessive permissions granted',
        mitigation: 'Monthly team access audit; RBAC tests on staging',
        owner: 'Company Owner',
      },
    ],
    kpis: [
      {
        id: 'active-users',
        label: 'Active team members',
        sourceRoute: '/settings/team',
        sourceNote: 'From team settings — real user records',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'hr_workforce',
        trigger: 'New hire onboarded',
        deliverable: 'User account with correct role and mobile access',
      },
    ],
    auditNotes: ['Settings routes RBAC-gated per role-experience.ts.'],
    requiredPermissions: ['settings:read', 'team:read', '*'],
  },
  {
    id: 'aura_digital_workforce',
    label: 'AURA Digital Workforce',
    mandate: 'Deploy and govern AURA agents, automation, and tenant capabilities with approval gates.',
    accountableOwner: 'Company Owner',
    workspaceHref: '/departments/aura_digital_workforce',
    manageRoutes: ['/aura/agents', '/automation', '/aura/todays-plan'],
    actionQueueCategories: ['Approvals'],
    actionQueueIds: ['approvals-waiting'],
    missionControlModules: ['aura', 'automation', 'tenant_capability'],
    weeklyRoutine: [
      { label: "AURA Today's Plan", href: '/aura/todays-plan', cadence: 'weekly' },
      { label: 'Automation command centre', href: '/automation', cadence: 'weekly' },
    ],
    monthlyRoutine: [
      { label: 'Agent capability review', href: '/aura/agents', cadence: 'monthly' },
    ],
    approvals: [
      {
        id: 'aura-action',
        label: 'AURA proposed actions',
        href: '/aura/todays-plan',
        note: 'All high-risk agent actions require Owner approval.',
      },
      {
        id: 'tenant-capability',
        label: 'Tenant capability activation',
        href: '/aura/agents',
        note: 'Capability builder activation gate.',
      },
    ],
    risks: [
      {
        id: 'unapproved-automation',
        risk: 'Automation runs without Owner review',
        mitigation: 'Approval queue in todays-plan; prohibited actions in tenant capabilities',
        owner: 'Company Owner',
      },
    ],
    kpis: [
      {
        id: 'pending-aura-approvals',
        label: 'Items waiting approval',
        sourceRoute: '/aura/todays-plan',
        sourceNote: 'Shared with executive queue approvals-waiting count',
      },
    ],
    handoffs: [
      {
        toDepartmentId: 'operations',
        trigger: 'AURA dispatch recommendation approved',
        deliverable: 'Updated schedule or job assignment',
      },
    ],
    auditNotes: ['PROHIBITED_CAPABILITY_ACTIONS enforced in tenant capability builder.'],
    requiredPermissions: ['agents:read', 'automation:read', 'executive:read', '*'],
  },
];

export function getCorporateDepartmentById(
  id: CorporateDepartmentId,
): CorporateDepartmentDefinition | undefined {
  return CORPORATE_DEPARTMENTS.find((dept) => dept.id === id);
}

export function mapActionQueueItemToDepartments(
  item: ExecutiveOwnerActionItem,
): CorporateDepartmentId[] {
  const byId = CORPORATE_DEPARTMENTS.filter((dept) => dept.actionQueueIds.includes(item.id)).map(
    (dept) => dept.id,
  );
  if (byId.length > 0) return byId;

  return CORPORATE_DEPARTMENTS.filter((dept) =>
    dept.actionQueueCategories.includes(item.category),
  ).map((dept) => dept.id);
}

export const EXPECTED_CORPORATE_DEPARTMENT_COUNT = 19;
