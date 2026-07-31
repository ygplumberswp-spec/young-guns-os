import { and, desc, eq, sql } from 'drizzle-orm';
import type {
  CreateRecruitingApplicationRequest,
  CreateRecruitingCandidateRequest,
  RecruitingApplicationSummary,
  RecruitingCandidateDetail,
  RecruitingCandidateSummary,
  RecruitingStats,
  UpdateRecruitingApplicationRequest,
  UpdateRecruitingCandidateRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import { recruitingApplications, recruitingCandidates } from '@titan/db';

export class RecruitingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RecruitingError';
  }
}

export type AuraRecruitingContext = {
  candidateCount: number;
  applicationCount: number;
  newCount: number;
  interviewCount: number;
  candidates: Array<{
    id: string;
    name: string;
    roleTitle: string | null;
    status: string;
    applicationCount: number;
  }>;
};

export class RecruitingService {
  constructor(private readonly db: DatabaseClient) {}

  async getStats(companyId: string): Promise<RecruitingStats> {
    const candidates = await this.db.query.recruitingCandidates.findMany({
      where: eq(recruitingCandidates.companyId, companyId),
    });

    const [applicationCountRow] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(recruitingApplications)
      .where(eq(recruitingApplications.companyId, companyId));

    return {
      candidateCount: candidates.length,
      applicationCount: applicationCountRow?.count ?? 0,
      newCount: candidates.filter((candidate) => candidate.status === 'new').length,
      interviewCount: candidates.filter((candidate) => candidate.status === 'interview').length,
    };
  }

  async listCandidates(companyId: string): Promise<RecruitingCandidateSummary[]> {
    const rows = await this.db.query.recruitingCandidates.findMany({
      where: eq(recruitingCandidates.companyId, companyId),
      with: { applications: true },
      orderBy: [desc(recruitingCandidates.updatedAt)],
    });

    return rows.map((row) => toCandidateSummary(row, row.applications.length));
  }

  async getCandidate(
    companyId: string,
    candidateId: string,
  ): Promise<RecruitingCandidateDetail | null> {
    const row = await this.db.query.recruitingCandidates.findFirst({
      where: and(
        eq(recruitingCandidates.id, candidateId),
        eq(recruitingCandidates.companyId, companyId),
      ),
      with: { applications: { with: { candidate: true } } },
    });

    if (!row) {
      return null;
    }

    return {
      ...toCandidateSummary(row, row.applications.length),
      applications: row.applications.map(toApplicationSummary),
    };
  }

  async createCandidate(
    companyId: string,
    input: CreateRecruitingCandidateRequest,
  ): Promise<RecruitingCandidateDetail> {
    const name = input.name.trim();

    if (!name) {
      throw new RecruitingError('VALIDATION_ERROR', 'Candidate name is required');
    }

    const [created] = await this.db
      .insert(recruitingCandidates)
      .values({
        companyId,
        name,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        roleTitle: input.roleTitle?.trim() || null,
        status: input.status ?? 'new',
        source: input.source?.trim() || null,
        skills: input.skills ?? [],
        notes: input.notes?.trim() || null,
      })
      .returning();

    const detail = await this.getCandidate(companyId, created!.id);
    return detail!;
  }

  async updateCandidate(
    companyId: string,
    candidateId: string,
    input: UpdateRecruitingCandidateRequest,
  ): Promise<RecruitingCandidateDetail> {
    const existing = await this.db.query.recruitingCandidates.findFirst({
      where: and(
        eq(recruitingCandidates.id, candidateId),
        eq(recruitingCandidates.companyId, companyId),
      ),
    });

    if (!existing) {
      throw new RecruitingError('NOT_FOUND', 'Candidate not found');
    }

    await this.db
      .update(recruitingCandidates)
      .set({
        name: input.name?.trim() ?? existing.name,
        email: input.email !== undefined ? input.email?.trim() || null : existing.email,
        phone: input.phone !== undefined ? input.phone?.trim() || null : existing.phone,
        roleTitle:
          input.roleTitle !== undefined ? input.roleTitle?.trim() || null : existing.roleTitle,
        status: input.status ?? existing.status,
        source: input.source !== undefined ? input.source?.trim() || null : existing.source,
        skills: input.skills ?? existing.skills,
        notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(recruitingCandidates.id, candidateId));

    const detail = await this.getCandidate(companyId, candidateId);
    return detail!;
  }

  async listApplications(companyId: string): Promise<RecruitingApplicationSummary[]> {
    const rows = await this.db.query.recruitingApplications.findMany({
      where: eq(recruitingApplications.companyId, companyId),
      with: { candidate: true },
      orderBy: [desc(recruitingApplications.updatedAt)],
    });

    return rows.map(toApplicationSummary);
  }

  async createApplication(
    companyId: string,
    input: CreateRecruitingApplicationRequest,
  ): Promise<RecruitingApplicationSummary> {
    const roleTitle = input.roleTitle.trim();

    if (!roleTitle) {
      throw new RecruitingError('VALIDATION_ERROR', 'Role title is required');
    }

    const candidate = await this.db.query.recruitingCandidates.findFirst({
      where: and(
        eq(recruitingCandidates.id, input.candidateId),
        eq(recruitingCandidates.companyId, companyId),
      ),
    });

    if (!candidate) {
      throw new RecruitingError('NOT_FOUND', 'Candidate not found');
    }

    const [created] = await this.db
      .insert(recruitingApplications)
      .values({
        companyId,
        candidateId: input.candidateId,
        roleTitle,
        status: input.status ?? 'new',
        notes: input.notes?.trim() || null,
      })
      .returning();

    const row = await this.db.query.recruitingApplications.findFirst({
      where: eq(recruitingApplications.id, created!.id),
      with: { candidate: true },
    });

    return toApplicationSummary(row!);
  }

  async updateApplication(
    companyId: string,
    applicationId: string,
    input: UpdateRecruitingApplicationRequest,
  ): Promise<RecruitingApplicationSummary> {
    const existing = await this.db.query.recruitingApplications.findFirst({
      where: and(
        eq(recruitingApplications.id, applicationId),
        eq(recruitingApplications.companyId, companyId),
      ),
    });

    if (!existing) {
      throw new RecruitingError('NOT_FOUND', 'Application not found');
    }

    const [updated] = await this.db
      .update(recruitingApplications)
      .set({
        roleTitle: input.roleTitle?.trim() ?? existing.roleTitle,
        status: input.status ?? existing.status,
        notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(recruitingApplications.id, applicationId))
      .returning();

    const row = await this.db.query.recruitingApplications.findFirst({
      where: eq(recruitingApplications.id, updated!.id),
      with: { candidate: true },
    });

    return toApplicationSummary(row!);
  }

  async buildAuraContext(companyId: string): Promise<AuraRecruitingContext> {
    const stats = await this.getStats(companyId);
    const candidates = await this.listCandidates(companyId);

    return {
      candidateCount: stats.candidateCount,
      applicationCount: stats.applicationCount,
      newCount: stats.newCount,
      interviewCount: stats.interviewCount,
      candidates: candidates.slice(0, 10).map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        roleTitle: candidate.roleTitle,
        status: candidate.status,
        applicationCount: candidate.applicationCount,
      })),
    };
  }
}

function toCandidateSummary(
  row: typeof recruitingCandidates.$inferSelect,
  applicationCount: number,
): RecruitingCandidateSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    roleTitle: row.roleTitle,
    status: row.status,
    source: row.source ?? null,
    skills: Array.isArray(row.skills) ? row.skills : [],
    notes: row.notes,
    applicationCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toApplicationSummary(
  row: typeof recruitingApplications.$inferSelect & {
    candidate?: typeof recruitingCandidates.$inferSelect;
  },
): RecruitingApplicationSummary {
  return {
    id: row.id,
    candidateId: row.candidateId,
    candidateName: row.candidate?.name ?? 'Unknown',
    roleTitle: row.roleTitle,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
