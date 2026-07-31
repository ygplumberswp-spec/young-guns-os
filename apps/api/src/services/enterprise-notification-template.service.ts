import { and, eq } from 'drizzle-orm';
import type {
  CreateNcNotificationTemplateRequest,
  NcNotificationTemplateSummary,
  NcTemplatePreview,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { ncNotificationTemplates } from '@titan/db';

type StaffScope = { companyId: string; userId: string };

export class EnterpriseNotificationTemplateService {
  constructor(private readonly db: DatabaseClient) {}

  async listTemplates(companyId: string): Promise<NcNotificationTemplateSummary[]> {
    const rows = await this.db.query.ncNotificationTemplates.findMany({
      where: eq(ncNotificationTemplates.companyId, companyId),
      orderBy: (t, { asc }) => [asc(t.name)],
      limit: 200,
    });
    return rows.map(toTemplateSummary);
  }

  async createTemplate(
    scope: StaffScope,
    input: CreateNcNotificationTemplateRequest,
  ): Promise<NcNotificationTemplateSummary> {
    const [created] = await this.db
      .insert(ncNotificationTemplates)
      .values({
        companyId: scope.companyId,
        templateKey: input.templateKey.trim(),
        name: input.name.trim(),
        moduleSource: input.moduleSource ?? null,
        eventType: input.eventType?.trim() ?? null,
        subjectTemplate: input.subjectTemplate.trim(),
        bodyTemplate: input.bodyTemplate.trim(),
        variables: input.variables ?? [],
        locale: input.locale ?? 'en',
        branding: input.branding ?? {},
      })
      .returning();
    if (!created) throw new Error('Unable to create template');
    return toTemplateSummary(created);
  }

  async getTemplate(companyId: string, templateId: string) {
    return this.db.query.ncNotificationTemplates.findFirst({
      where: and(
        eq(ncNotificationTemplates.companyId, companyId),
        eq(ncNotificationTemplates.id, templateId),
      ),
    });
  }

  async getTemplateByKey(companyId: string, templateKey: string, locale = 'en') {
    return this.db.query.ncNotificationTemplates.findFirst({
      where: and(
        eq(ncNotificationTemplates.companyId, companyId),
        eq(ncNotificationTemplates.templateKey, templateKey),
        eq(ncNotificationTemplates.locale, locale),
        eq(ncNotificationTemplates.isActive, true),
      ),
    });
  }

  previewTemplate(
    subjectTemplate: string,
    bodyTemplate: string,
    variables: Record<string, string> = {},
  ): NcTemplatePreview {
    return {
      subject: applyVariables(subjectTemplate, variables),
      body: applyVariables(bodyTemplate, variables),
    };
  }

  async previewTemplateById(
    companyId: string,
    templateId: string,
    variables: Record<string, string> = {},
  ): Promise<NcTemplatePreview | null> {
    const template = await this.getTemplate(companyId, templateId);
    if (!template) return null;
    return this.previewTemplate(template.subjectTemplate, template.bodyTemplate, variables);
  }
}

function applyVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
}

function toTemplateSummary(
  row: typeof ncNotificationTemplates.$inferSelect,
): NcNotificationTemplateSummary {
  return {
    id: row.id,
    templateKey: row.templateKey,
    name: row.name,
    moduleSource: row.moduleSource,
    eventType: row.eventType,
    subjectTemplate: row.subjectTemplate,
    bodyTemplate: row.bodyTemplate,
    variables: row.variables ?? [],
    locale: row.locale,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}
