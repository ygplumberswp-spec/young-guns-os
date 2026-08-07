import { eq } from 'drizzle-orm';
import type {
  CompanyProfile,
  CompanyPreferences,
  UpdateCompanyProfileRequest,
} from '@titan/shared';
import { DEFAULT_COMPANY_PREFERENCES } from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { companies, securityAuditLogs } from '@titan/db';

export class CompanyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CompanyError';
  }
}

export class CompanyService {
  constructor(private readonly db: DatabaseClient) {}

  async getProfile(companyId: string): Promise<CompanyProfile | null> {
    const company = await this.db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    if (!company) {
      return null;
    }

    return toCompanyProfile(company);
  }

  async updateProfile(
    companyId: string,
    input: UpdateCompanyProfileRequest,
    options?: { updatedByUserId?: string | null },
  ): Promise<CompanyProfile> {
    const existing = await this.db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });

    if (!existing) {
      throw new CompanyError('NOT_FOUND', 'Company not found');
    }

    const existingPreferences = {
      ...DEFAULT_COMPANY_PREFERENCES,
      ...(existing.preferences ?? {}),
    };
    const nextReviewUrl =
      input.preferences?.googleReviewUrl !== undefined
        ? input.preferences.googleReviewUrl
        : undefined;

    const [updated] = await this.db
      .update(companies)
      .set({
        name: input.name !== undefined ? input.name.trim() : existing.name,
        industry:
          input.industry !== undefined ? normalizeNullableText(input.industry) : existing.industry,
        businessType:
          input.businessType !== undefined
            ? normalizeNullableText(input.businessType)
            : existing.businessType,
        preferences: input.preferences
          ? mergePreferences(existing.preferences, input.preferences)
          : existing.preferences,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId))
      .returning();

    if (!updated) {
      throw new CompanyError('UPDATE_FAILED', 'Unable to update company profile');
    }

    if (nextReviewUrl !== undefined && nextReviewUrl !== (existingPreferences.googleReviewUrl ?? null)) {
      await this.db.insert(securityAuditLogs).values({
        companyId,
        category: 'security',
        action: 'google_review_url_updated',
        entityType: 'company',
        entityId: companyId,
        userId: options?.updatedByUserId ?? null,
        metadata: {
          hadPreviousUrl: Boolean(existingPreferences.googleReviewUrl),
          hasUrl: Boolean(nextReviewUrl),
        },
      });
    }

    return toCompanyProfile(updated);
  }
}

function toCompanyProfile(company: typeof companies.$inferSelect): CompanyProfile {
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    industry: company.industry,
    businessType: company.businessType,
    preferences: {
      ...DEFAULT_COMPANY_PREFERENCES,
      ...(company.preferences ?? {}),
    },
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mergePreferences(
  existing: CompanyPreferences,
  incoming: CompanyPreferences,
): CompanyPreferences {
  return {
    ...existing,
    ...incoming,
  };
}
