import { eq } from 'drizzle-orm';
import type { RlmLaunchChecklistItemSummary, RlmReleaseStatus, RlmVersionRecordSummary } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { rlmLaunchChecklistItems, rlmVersionRecords } from '@titan/db';

type StaffScope = { companyId: string; userId: string };

const DEFAULT_LAUNCH_CHECKLIST: Array<{ itemKey: string; itemName: string; category: string }> = [
  { itemKey: 'production_infrastructure', itemName: 'Production infrastructure verified', category: 'infrastructure' },
  { itemKey: 'security_hardening', itemName: 'Security hardening and penetration review complete', category: 'security' },
  { itemKey: 'integrations_live', itemName: 'Live integrations verified (Xero, email, payments)', category: 'integrations' },
  { itemKey: 'ios_production_build', itemName: 'iOS production build verified', category: 'mobile' },
  { itemKey: 'android_production_build', itemName: 'Android production build verified', category: 'mobile' },
  { itemKey: 'app_store_metadata', itemName: 'App Store metadata and privacy declarations prepared', category: 'mobile' },
  { itemKey: 'play_store_listing', itemName: 'Google Play Store listing prepared', category: 'mobile' },
  { itemKey: 'documentation_complete', itemName: 'Production documentation complete', category: 'documentation' },
  { itemKey: 'monitoring_active', itemName: 'Monitoring and alerting active', category: 'monitoring' },
  { itemKey: 'backups_verified', itemName: 'Backup and recovery procedures verified', category: 'backups' },
  { itemKey: 'billing_configured', itemName: 'Billing and subscription flows configured', category: 'billing' },
  { itemKey: 'customer_onboarding', itemName: 'Customer onboarding flows tested', category: 'onboarding' },
  { itemKey: 'support_readiness', itemName: 'Support team trained and escalation paths defined', category: 'support' },
  { itemKey: 'release_notes_published', itemName: 'Release notes finalized for v1.0.0', category: 'release' },
  { itemKey: 'owner_approval', itemName: 'Owner approval for public release obtained', category: 'release' },
];

const V1_FEATURE_SUMMARY = [
  { module: 'CRM & Customers', description: 'Customer management, activities, and portal experience' },
  { module: 'Jobs & Dispatch', description: 'Job scheduling, dispatch intelligence, and field workforce' },
  { module: 'Finance', description: 'Invoicing, Xero integration, and financial intelligence' },
  { module: 'Fleet & Assets', description: 'Fleet tracking, asset lifecycle, and equipment intelligence' },
  { module: 'Mobile Platform', description: 'Offline sync, push notifications, camera, GPS, and field media' },
  { module: 'Integrations', description: 'Xero, email, WhatsApp, SMS, payments, and connector hub' },
  { module: 'AURA AI', description: 'Agent orchestration, task approval, and domain specialists' },
  { module: 'Enterprise Security', description: 'RBAC, audit logging, tenant isolation, and compliance' },
  { module: 'Mission Control', description: 'Platform health, alerts, and operational dashboard' },
  { module: 'Release & Launch', description: 'Release center, production launch, and go-live wizard' },
];

const V1_KNOWN_LIMITATIONS = [
  { area: 'App Store Submission', description: 'Manual submission required — no automatic publishing' },
  { area: 'Documentation', description: 'Documentation artifacts require manual completion of outlined sections' },
  { area: 'White-label', description: 'Branding profiles must be configured per tenant for full white-label release' },
];

export class EnterpriseReleaseManagementVersionService {
  constructor(private readonly db: DatabaseClient) {}

  async getVersionRecord(companyId: string): Promise<RlmVersionRecordSummary | null> {
    await this.ensureVersionRecord(companyId);
    const row = await this.db.query.rlmVersionRecords.findFirst({
      where: eq(rlmVersionRecords.companyId, companyId),
      orderBy: (r, { desc }) => [desc(r.createdAt)],
    });
    return row ? toVersionSummary(row) : null;
  }

  async ensureVersionRecord(companyId: string): Promise<void> {
    const existing = await this.db.query.rlmVersionRecords.findFirst({
      where: eq(rlmVersionRecords.companyId, companyId),
    });
    if (existing) return;

    await this.db.insert(rlmVersionRecords).values({
      companyId,
      versionKey: 'titan_v1_0_0',
      versionNumber: '1.0.0',
      versionName: 'TITAN Business OS v1.0.0',
      status: 'unknown',
      releaseNotes: {
        title: 'TITAN Business OS v1.0.0 — Initial Public Release',
        summary:
          'First public release of TITAN Business OS, delivering integrated enterprise business operations, mobile field workforce, AI agents, and production launch capabilities.',
        highlights: [
          'Complete enterprise module suite (CRM, jobs, finance, fleet, inventory)',
          'Mobile platform with offline sync, push notifications, and field intelligence',
          'AURA AI agent orchestration with approval workflows',
          'Production launch and release management platforms',
        ],
      },
      featureSummary: V1_FEATURE_SUMMARY,
      breakingChanges: [],
      migrationNotes: [
        { note: 'Run all database migrations through 0088 before v1.0.0 deployment' },
        { note: 'Configure production environment variables per deployment guide' },
        { note: 'Complete go-live wizard before marking release as ready' },
      ],
      knownLimitations: V1_KNOWN_LIMITATIONS,
    });
  }

  async finalizeVersion(scope: StaffScope): Promise<RlmVersionRecordSummary> {
    await this.ensureVersionRecord(scope.companyId);
    const [updated] = await this.db
      .update(rlmVersionRecords)
      .set({
        status: 'ready',
        userId: scope.userId,
        updatedAt: new Date(),
      })
      .where(eq(rlmVersionRecords.companyId, scope.companyId))
      .returning();
    return toVersionSummary(updated!);
  }

  async listLaunchChecklist(companyId: string): Promise<RlmLaunchChecklistItemSummary[]> {
    await this.ensureLaunchChecklist(companyId);
    const rows = await this.db.query.rlmLaunchChecklistItems.findMany({
      where: eq(rlmLaunchChecklistItems.companyId, companyId),
      orderBy: (r, { asc }) => [asc(r.category), asc(r.itemName)],
    });
    return rows.map(toChecklistSummary);
  }

  async ensureLaunchChecklist(companyId: string): Promise<void> {
    const existing = await this.db.query.rlmLaunchChecklistItems.findFirst({
      where: eq(rlmLaunchChecklistItems.companyId, companyId),
    });
    if (existing) return;

    for (const item of DEFAULT_LAUNCH_CHECKLIST) {
      await this.db.insert(rlmLaunchChecklistItems).values({
        companyId,
        itemKey: item.itemKey,
        itemName: item.itemName,
        category: item.category,
        status: 'pending',
        isRequired: true,
      });
    }
  }

  getPendingChecklistCount(items: RlmLaunchChecklistItemSummary[]): number {
    return items.filter((i) => i.isRequired && i.status === 'pending').length;
  }

  isLaunchChecklistComplete(items: RlmLaunchChecklistItemSummary[]): boolean {
    const required = items.filter((i) => i.isRequired);
    return required.length > 0 && required.every((i) => i.status === 'passed' || i.status === 'manual');
  }
}

function toVersionSummary(row: typeof rlmVersionRecords.$inferSelect): RlmVersionRecordSummary {
  return {
    id: row.id,
    versionKey: row.versionKey,
    versionNumber: row.versionNumber,
    versionName: row.versionName,
    status: row.status as RlmReleaseStatus,
    releaseNotes: row.releaseNotes,
    featureSummary: row.featureSummary,
    breakingChanges: row.breakingChanges,
    migrationNotes: row.migrationNotes,
    knownLimitations: row.knownLimitations,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toChecklistSummary(row: typeof rlmLaunchChecklistItems.$inferSelect): RlmLaunchChecklistItemSummary {
  return {
    id: row.id,
    itemKey: row.itemKey,
    itemName: row.itemName,
    category: row.category,
    status: row.status,
    isRequired: row.isRequired,
    notes: row.notes,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}
