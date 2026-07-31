import { and, eq } from 'drizzle-orm';
import type {
  RlmDocCategory,
  RlmDocumentationArtifactSummary,
  RlmValidationStatus,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { rlmDocumentationArtifacts } from '@titan/db';

type StaffScope = { companyId: string; userId: string };

const DOC_TEMPLATES: Array<{
  docKey: string;
  docCategory: RlmDocCategory;
  title: string;
  sections: string[];
}> = [
  {
    docKey: 'system_overview',
    docCategory: 'system_overview',
    title: 'TITAN Business OS — System Overview',
    sections: [
      'Platform architecture',
      'Core modules and capabilities',
      'Multi-tenant model',
      'Authentication and RBAC',
      'Integration ecosystem',
      'Mobile and offline architecture',
    ],
  },
  {
    docKey: 'administrator_guide',
    docCategory: 'administrator_guide',
    title: 'Administrator Guide',
    sections: [
      'Initial setup and configuration',
      'User and role management',
      'Tenant settings and branding',
      'Integration configuration',
      'Security and compliance settings',
      'Monitoring and Mission Control',
    ],
  },
  {
    docKey: 'user_guide',
    docCategory: 'user_guide',
    title: 'User Guide',
    sections: [
      'Getting started',
      'Navigation and dashboard',
      'Core workflows (jobs, customers, dispatch)',
      'Mobile app usage',
      'Notifications and alerts',
      'Support and help resources',
    ],
  },
  {
    docKey: 'deployment_guide',
    docCategory: 'deployment_guide',
    title: 'Deployment Guide',
    sections: [
      'Infrastructure requirements',
      'Environment configuration',
      'Database migrations',
      'Production deployment pipeline',
      'Mobile build and distribution',
      'Post-deployment verification',
    ],
  },
  {
    docKey: 'disaster_recovery',
    docCategory: 'disaster_recovery',
    title: 'Disaster Recovery Guide',
    sections: [
      'Backup strategy',
      'Recovery point objectives',
      'Recovery time objectives',
      'Failover procedures',
      'Data restoration',
      'Business continuity integration',
    ],
  },
  {
    docKey: 'api_guide',
    docCategory: 'api_guide',
    title: 'API Guide',
    sections: [
      'Authentication and API keys',
      'REST API endpoints',
      'Webhooks and events',
      'Rate limits and quotas',
      'Error handling',
      'SDK and integration patterns',
    ],
  },
  {
    docKey: 'integration_guide',
    docCategory: 'integration_guide',
    title: 'Integration Guide',
    sections: [
      'Supported integrations (Xero, email, WhatsApp, payments)',
      'Connector configuration',
      'Data mapping and sync',
      'Troubleshooting integration failures',
      'Custom connector development',
    ],
  },
  {
    docKey: 'changelog',
    docCategory: 'changelog',
    title: 'Change Log',
    sections: ['v1.0.0 release notes', 'Feature additions', 'Bug fixes', 'Security updates'],
  },
  {
    docKey: 'version_history',
    docCategory: 'version_history',
    title: 'Version History',
    sections: [
      'Version numbering scheme',
      'v1.0.0 milestone summary',
      'Migration history',
      'Deprecation policy',
    ],
  },
];

export class EnterpriseReleaseManagementDocumentationService {
  constructor(private readonly db: DatabaseClient) {}

  async listArtifacts(companyId: string): Promise<RlmDocumentationArtifactSummary[]> {
    await this.ensureDocumentationArtifacts(companyId);
    const rows = await this.db.query.rlmDocumentationArtifacts.findMany({
      where: eq(rlmDocumentationArtifacts.companyId, companyId),
      orderBy: (r, { asc }) => [asc(r.docCategory)],
    });
    return rows.map(toSummary);
  }

  async ensureDocumentationArtifacts(companyId: string): Promise<void> {
    for (const doc of DOC_TEMPLATES) {
      const existing = await this.db.query.rlmDocumentationArtifacts.findFirst({
        where: and(
          eq(rlmDocumentationArtifacts.companyId, companyId),
          eq(rlmDocumentationArtifacts.docKey, doc.docKey),
        ),
      });
      if (existing) continue;

      await this.db.insert(rlmDocumentationArtifacts).values({
        companyId,
        docKey: doc.docKey,
        docCategory: doc.docCategory,
        title: doc.title,
        status: 'pending',
        completenessPercent: 0,
        contentOutline: {
          sections: doc.sections.map((section) => ({ title: section, status: 'pending' })),
          referenceDocs: ['docs/ARCHITECTURE.md', 'docs/MILESTONES.md'],
        },
      });
    }
  }

  async refreshDocumentationStatus(scope: StaffScope): Promise<RlmDocumentationArtifactSummary[]> {
    await this.ensureDocumentationArtifacts(scope.companyId);

    const rows = await this.db.query.rlmDocumentationArtifacts.findMany({
      where: eq(rlmDocumentationArtifacts.companyId, scope.companyId),
    });

    for (const row of rows) {
      const outline = row.contentOutline as { sections?: Array<{ status?: string }> };
      const sections = outline.sections ?? [];
      const completedSections = sections.filter((s) => s.status === 'completed').length;
      const completenessPercent =
        sections.length > 0 ? Math.round((completedSections / sections.length) * 100) : 0;
      const status: RlmValidationStatus =
        completenessPercent >= 100 ? 'passed' : completenessPercent >= 50 ? 'warning' : 'pending';

      await this.db
        .update(rlmDocumentationArtifacts)
        .set({
          completenessPercent,
          status,
          lastUpdatedAt: new Date(),
        })
        .where(eq(rlmDocumentationArtifacts.id, row.id));
    }

    return this.listArtifacts(scope.companyId);
  }

  getDocumentationCompleteness(artifacts: RlmDocumentationArtifactSummary[]): number {
    if (artifacts.length === 0) return 0;
    const total = artifacts.reduce((sum, a) => sum + a.completenessPercent, 0);
    return Math.round(total / artifacts.length);
  }
}

function toSummary(
  row: typeof rlmDocumentationArtifacts.$inferSelect,
): RlmDocumentationArtifactSummary {
  return {
    id: row.id,
    docKey: row.docKey,
    docCategory: row.docCategory,
    title: row.title,
    status: row.status,
    completenessPercent: row.completenessPercent,
    contentOutline: row.contentOutline,
    lastUpdatedAt: row.lastUpdatedAt.toISOString(),
  };
}
