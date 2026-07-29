import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { hasAnyPermission } from '@titan/auth';
import type {
  CompanyPolicyDetail,
  CompanyPolicySummary,
  CreateCompanyPolicyRequest,
  CreateKnowledgeArticleRequest,
  CreateKnowledgeCategoryRequest,
  CreateSopDocumentRequest,
  CreateTrainingCourseRequest,
  CreateKnowledgeTrainingRecordRequest,
  IndexDocumentRequest,
  KnowledgeArticleDetail,
  KnowledgeArticleSummary,
  KnowledgeAuraContext,
  KnowledgeCategorySummary,
  KnowledgeRecommendationSummary,
  KnowledgeSearchRequest,
  KnowledgeSearchResult,
  KnowledgeStats,
  KnowledgeTrainingRecordSummary,
  KnowledgeVersionSummary,
  PublishKnowledgeContentRequest,
  SopDocumentDetail,
  SopDocumentSummary,
  SubmitKnowledgeContentRequest,
  TrainingCourseSummary,
  UpdateCompanyPolicyRequest,
  UpdateKnowledgeArticleRequest,
  UpdateKnowledgeCategoryRequest,
  UpdateKnowledgeRecommendationRequest,
  UpdateKnowledgeTrainingRecordRequest,
  UpdateSopDocumentRequest,
  UpdateTrainingCourseRequest,
} from '@titan/shared';
import type { DatabaseClient } from '@titan/db';
import {
  companyPolicies,
  documents,
  knowledgeArticles,
  knowledgeCategories,
  knowledgeRecommendations,
  knowledgeTrainingRecords,
  knowledgeVersions,
  sopDocuments,
  trainingCourses,
  users,
} from '@titan/db';

export class KnowledgeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'KnowledgeError';
  }
}

type TenantScope = {
  companyId: string;
  userId: string;
};

type KnowledgeServiceDeps = {
  db: DatabaseClient;
};

export class KnowledgeService {
  constructor(private readonly deps: KnowledgeServiceDeps) {}

  async getStats(companyId: string): Promise<KnowledgeStats> {
    const [articles, sops, courses, policies, recommendations, records] = await Promise.all([
      this.deps.db.query.knowledgeArticles.findMany({ where: eq(knowledgeArticles.companyId, companyId) }),
      this.deps.db.query.sopDocuments.findMany({ where: eq(sopDocuments.companyId, companyId) }),
      this.deps.db.query.trainingCourses.findMany({ where: eq(trainingCourses.companyId, companyId) }),
      this.deps.db.query.companyPolicies.findMany({ where: eq(companyPolicies.companyId, companyId) }),
      this.listRecommendations(companyId),
      this.deps.db.query.knowledgeTrainingRecords.findMany({ where: eq(knowledgeTrainingRecords.companyId, companyId) }),
    ]);

    const now = new Date();

    return {
      articleCount: articles.length,
      publishedArticleCount: articles.filter((row) => row.status === 'published').length,
      sopCount: sops.length,
      publishedSopCount: sops.filter((row) => row.status === 'published').length,
      trainingCourseCount: courses.length,
      activeTrainingCourseCount: courses.filter((row) => row.status === 'active').length,
      policyCount: policies.length,
      publishedPolicyCount: policies.filter((row) => row.status === 'published').length,
      pendingRecommendationCount: recommendations.filter((row) => row.status === 'pending').length,
      expiredCertificationCount: records.filter(
        (row) => row.certificationExpiresAt && row.certificationExpiresAt < now,
      ).length,
    };
  }

  async listCategories(companyId: string): Promise<KnowledgeCategorySummary[]> {
    const [categories, articleCounts] = await Promise.all([
      this.deps.db.query.knowledgeCategories.findMany({
        where: eq(knowledgeCategories.companyId, companyId),
        orderBy: [desc(knowledgeCategories.updatedAt)],
      }),
      this.getCategoryArticleCounts(companyId),
    ]);

    return categories.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      parentId: row.parentId,
      articleCount: articleCounts.get(row.id) ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createCategory(companyId: string, input: CreateKnowledgeCategoryRequest): Promise<KnowledgeCategorySummary> {
    const name = input.name.trim();
    if (!name) {
      throw new KnowledgeError('VALIDATION_ERROR', 'Category name is required');
    }

    const [created] = await this.deps.db
      .insert(knowledgeCategories)
      .values({
        companyId,
        name,
        description: normalizeOptionalText(input.description),
        parentId: input.parentId ?? null,
      })
      .returning();

    return {
      id: created!.id,
      name: created!.name,
      description: created!.description,
      parentId: created!.parentId,
      articleCount: 0,
      createdAt: created!.createdAt.toISOString(),
      updatedAt: created!.updatedAt.toISOString(),
    };
  }

  async updateCategory(
    companyId: string,
    categoryId: string,
    input: UpdateKnowledgeCategoryRequest,
  ): Promise<KnowledgeCategorySummary> {
    await this.ensureCategory(companyId, categoryId);

    await this.deps.db
      .update(knowledgeCategories)
      .set({
        name: input.name?.trim(),
        description: input.description !== undefined ? normalizeOptionalText(input.description) : undefined,
        parentId: input.parentId,
        updatedAt: new Date(),
      })
      .where(and(eq(knowledgeCategories.id, categoryId), eq(knowledgeCategories.companyId, companyId)));

    const categories = await this.listCategories(companyId);
    return categories.find((row) => row.id === categoryId)!;
  }

  async listArticles(companyId: string, userPermissions: string[]): Promise<KnowledgeArticleSummary[]> {
    const rows = await this.deps.db.query.knowledgeArticles.findMany({
      where: eq(knowledgeArticles.companyId, companyId),
      with: { category: true, createdBy: true },
      orderBy: [desc(knowledgeArticles.updatedAt)],
    });

    return rows
      .filter((row) => this.canAccessContent(row.requiredPermissions, userPermissions))
      .map(toArticleSummary);
  }

  async getArticle(
    companyId: string,
    articleId: string,
    userPermissions: string[],
  ): Promise<KnowledgeArticleDetail | null> {
    const row = await this.deps.db.query.knowledgeArticles.findFirst({
      where: and(eq(knowledgeArticles.id, articleId), eq(knowledgeArticles.companyId, companyId)),
      with: { category: true, createdBy: true, approvedBy: true },
    });

    if (!row || !this.canAccessContent(row.requiredPermissions, userPermissions)) {
      return null;
    }

    return toArticleDetail(row);
  }

  async createArticle(
    scope: TenantScope,
    input: CreateKnowledgeArticleRequest,
  ): Promise<KnowledgeArticleDetail> {
    const title = input.title.trim();
    const content = input.content.trim();
    if (!title || !content) {
      throw new KnowledgeError('VALIDATION_ERROR', 'Title and content are required');
    }

    const keywords = extractKeywords(title, content, input.keywords);
    const summary = input.summary?.trim() || generateSummary(content);
    const relatedArticleIds = await this.findRelatedArticleIds(scope.companyId, keywords, []);

    const [created] = await this.deps.db
      .insert(knowledgeArticles)
      .values({
        companyId: scope.companyId,
        categoryId: input.categoryId ?? null,
        articleType: input.articleType ?? 'article',
        title,
        content,
        summary,
        keywords,
        status: input.status ?? 'draft',
        documentId: input.documentId ?? null,
        relatedArticleIds,
        requiredPermissions: input.requiredPermissions ?? [],
        createdByUserId: scope.userId,
      })
      .returning();

    await this.createVersion(scope, 'article', created!.id, 1, title, content, 'Initial version');

    const detail = await this.getArticle(scope.companyId, created!.id, ['*']);
    return detail!;
  }

  async updateArticle(
    scope: TenantScope,
    articleId: string,
    input: UpdateKnowledgeArticleRequest,
  ): Promise<KnowledgeArticleDetail> {
    const existing = await this.ensureArticle(scope.companyId, articleId);
    const title = input.title?.trim() ?? existing.title;
    const content = input.content?.trim() ?? existing.content;
    const keywords = extractKeywords(title, content, input.keywords ?? existing.keywords);
    const summary = input.summary !== undefined ? normalizeOptionalText(input.summary) : existing.summary;
    const versionNumber = existing.versionNumber + 1;
    const relatedArticleIds = await this.findRelatedArticleIds(
      scope.companyId,
      keywords,
      [articleId],
    );

    await this.deps.db
      .update(knowledgeArticles)
      .set({
        categoryId: input.categoryId !== undefined ? input.categoryId : undefined,
        articleType: input.articleType,
        title,
        content,
        summary,
        keywords,
        versionNumber,
        documentId: input.documentId !== undefined ? input.documentId : undefined,
        relatedArticleIds,
        requiredPermissions: input.requiredPermissions,
        status: 'draft',
        updatedAt: new Date(),
      })
      .where(and(eq(knowledgeArticles.id, articleId), eq(knowledgeArticles.companyId, scope.companyId)));

    await this.createVersion(
      scope,
      'article',
      articleId,
      versionNumber,
      title,
      content,
      input.changeSummary ?? `Updated to version ${versionNumber}`,
    );

    const detail = await this.getArticle(scope.companyId, articleId, ['*']);
    return detail!;
  }

  async submitArticle(
    scope: TenantScope,
    articleId: string,
    _input: SubmitKnowledgeContentRequest,
  ): Promise<KnowledgeArticleDetail> {
    await this.ensureArticle(scope.companyId, articleId);

    await this.deps.db
      .update(knowledgeArticles)
      .set({ status: 'pending_approval', updatedAt: new Date() })
      .where(and(eq(knowledgeArticles.id, articleId), eq(knowledgeArticles.companyId, scope.companyId)));

    return (await this.getArticle(scope.companyId, articleId, ['*']))!;
  }

  async publishArticle(
    scope: TenantScope,
    articleId: string,
    _input: PublishKnowledgeContentRequest,
  ): Promise<KnowledgeArticleDetail> {
    await this.ensureArticle(scope.companyId, articleId);

    await this.deps.db
      .update(knowledgeArticles)
      .set({
        status: 'published',
        approvedByUserId: scope.userId,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(knowledgeArticles.id, articleId), eq(knowledgeArticles.companyId, scope.companyId)));

    return (await this.getArticle(scope.companyId, articleId, ['*']))!;
  }

  async listSops(companyId: string, userPermissions: string[]): Promise<SopDocumentSummary[]> {
    const rows = await this.deps.db.query.sopDocuments.findMany({
      where: eq(sopDocuments.companyId, companyId),
      with: { category: true, createdBy: true },
      orderBy: [desc(sopDocuments.updatedAt)],
    });

    return rows
      .filter((row) => this.canAccessContent(row.requiredPermissions, userPermissions))
      .map(toSopSummary);
  }

  async getSop(companyId: string, sopId: string, userPermissions: string[]): Promise<SopDocumentDetail | null> {
    const row = await this.deps.db.query.sopDocuments.findFirst({
      where: and(eq(sopDocuments.id, sopId), eq(sopDocuments.companyId, companyId)),
      with: { category: true, createdBy: true, approvedBy: true },
    });

    if (!row || !this.canAccessContent(row.requiredPermissions, userPermissions)) {
      return null;
    }

    return toSopDetail(row);
  }

  async createSop(scope: TenantScope, input: CreateSopDocumentRequest): Promise<SopDocumentDetail> {
    const title = input.title.trim();
    const content = input.content.trim();
    if (!title || !content) {
      throw new KnowledgeError('VALIDATION_ERROR', 'Title and content are required');
    }

    const keywords = extractKeywords(title, content, input.keywords);
    const summary = input.summary?.trim() || generateSummary(content);

    const [created] = await this.deps.db
      .insert(sopDocuments)
      .values({
        companyId: scope.companyId,
        categoryId: input.categoryId ?? null,
        title,
        content,
        summary,
        department: input.department?.trim() || null,
        effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null,
        keywords,
        requiredPermissions: input.requiredPermissions ?? [],
        createdByUserId: scope.userId,
      })
      .returning();

    await this.createVersion(scope, 'sop', created!.id, 1, title, content, 'Initial version');

    return (await this.getSop(scope.companyId, created!.id, ['*']))!;
  }

  async updateSop(scope: TenantScope, sopId: string, input: UpdateSopDocumentRequest): Promise<SopDocumentDetail> {
    const existing = await this.ensureSop(scope.companyId, sopId);
    const title = input.title?.trim() ?? existing.title;
    const content = input.content?.trim() ?? existing.content;
    const keywords = extractKeywords(title, content, input.keywords ?? existing.keywords);
    const versionNumber = existing.versionNumber + 1;

    await this.deps.db
      .update(sopDocuments)
      .set({
        categoryId: input.categoryId !== undefined ? input.categoryId : undefined,
        title,
        content,
        summary: input.summary !== undefined ? normalizeOptionalText(input.summary) : existing.summary,
        department: input.department !== undefined ? input.department?.trim() || null : undefined,
        effectiveDate: input.effectiveDate !== undefined ? (input.effectiveDate ? new Date(input.effectiveDate) : null) : undefined,
        keywords,
        versionNumber,
        requiredPermissions: input.requiredPermissions,
        status: 'draft',
        updatedAt: new Date(),
      })
      .where(and(eq(sopDocuments.id, sopId), eq(sopDocuments.companyId, scope.companyId)));

    await this.createVersion(
      scope,
      'sop',
      sopId,
      versionNumber,
      title,
      content,
      input.changeSummary ?? `Updated to version ${versionNumber}`,
    );

    return (await this.getSop(scope.companyId, sopId, ['*']))!;
  }

  async submitSop(scope: TenantScope, sopId: string): Promise<SopDocumentDetail> {
    await this.ensureSop(scope.companyId, sopId);
    await this.deps.db
      .update(sopDocuments)
      .set({ status: 'pending_approval', updatedAt: new Date() })
      .where(and(eq(sopDocuments.id, sopId), eq(sopDocuments.companyId, scope.companyId)));
    return (await this.getSop(scope.companyId, sopId, ['*']))!;
  }

  async publishSop(scope: TenantScope, sopId: string): Promise<SopDocumentDetail> {
    await this.ensureSop(scope.companyId, sopId);
    await this.deps.db
      .update(sopDocuments)
      .set({
        status: 'published',
        approvedByUserId: scope.userId,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(sopDocuments.id, sopId), eq(sopDocuments.companyId, scope.companyId)));
    return (await this.getSop(scope.companyId, sopId, ['*']))!;
  }

  async archiveSop(scope: TenantScope, sopId: string): Promise<SopDocumentDetail> {
    await this.ensureSop(scope.companyId, sopId);
    await this.deps.db
      .update(sopDocuments)
      .set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(sopDocuments.id, sopId), eq(sopDocuments.companyId, scope.companyId)));
    return (await this.getSop(scope.companyId, sopId, ['*']))!;
  }

  async listTrainingCourses(companyId: string): Promise<TrainingCourseSummary[]> {
    const rows = await this.deps.db.query.trainingCourses.findMany({
      where: eq(trainingCourses.companyId, companyId),
      with: { category: true, createdBy: true, records: true },
      orderBy: [desc(trainingCourses.updatedAt)],
    });

    return rows.map(toTrainingCourseSummary);
  }

  async createTrainingCourse(scope: TenantScope, input: CreateTrainingCourseRequest): Promise<TrainingCourseSummary> {
    const title = input.title.trim();
    if (!title) {
      throw new KnowledgeError('VALIDATION_ERROR', 'Course title is required');
    }

    const [created] = await this.deps.db
      .insert(trainingCourses)
      .values({
        companyId: scope.companyId,
        categoryId: input.categoryId ?? null,
        title,
        description: normalizeOptionalText(input.description),
        contentType: input.contentType ?? 'article',
        contentUrl: input.contentUrl?.trim() || null,
        documentId: input.documentId ?? null,
        skillTags: input.skillTags ?? [],
        certificationRequired: input.certificationRequired ?? false,
        certificationValidDays: input.certificationValidDays ?? null,
        status: input.status ?? 'draft',
        createdByUserId: scope.userId,
      })
      .returning();

    const courses = await this.listTrainingCourses(scope.companyId);
    return courses.find((row) => row.id === created!.id)!;
  }

  async updateTrainingCourse(
    companyId: string,
    courseId: string,
    input: UpdateTrainingCourseRequest,
  ): Promise<TrainingCourseSummary> {
    await this.ensureCourse(companyId, courseId);

    await this.deps.db
      .update(trainingCourses)
      .set({
        categoryId: input.categoryId !== undefined ? input.categoryId : undefined,
        title: input.title?.trim(),
        description: input.description !== undefined ? normalizeOptionalText(input.description) : undefined,
        contentType: input.contentType,
        contentUrl: input.contentUrl !== undefined ? input.contentUrl?.trim() || null : undefined,
        documentId: input.documentId !== undefined ? input.documentId : undefined,
        skillTags: input.skillTags,
        certificationRequired: input.certificationRequired,
        certificationValidDays: input.certificationValidDays,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(and(eq(trainingCourses.id, courseId), eq(trainingCourses.companyId, companyId)));

    const courses = await this.listTrainingCourses(companyId);
    return courses.find((row) => row.id === courseId)!;
  }

  async listTrainingRecords(companyId: string, userId?: string): Promise<KnowledgeTrainingRecordSummary[]> {
    const rows = await this.deps.db.query.knowledgeTrainingRecords.findMany({
      where: userId
        ? and(eq(knowledgeTrainingRecords.companyId, companyId), eq(knowledgeTrainingRecords.userId, userId))
        : eq(knowledgeTrainingRecords.companyId, companyId),
      with: { course: true, user: true },
      orderBy: [desc(knowledgeTrainingRecords.updatedAt)],
    });

    return rows.map(toKnowledgeTrainingRecordSummary);
  }

  async createTrainingRecord(
    scope: TenantScope,
    input: CreateKnowledgeTrainingRecordRequest,
  ): Promise<KnowledgeTrainingRecordSummary> {
    await this.ensureCourse(scope.companyId, input.courseId);

    const [created] = await this.deps.db
      .insert(knowledgeTrainingRecords)
      .values({
        companyId: scope.companyId,
        courseId: input.courseId,
        userId: input.userId,
        status: input.status ?? 'not_started',
        progressPercent: input.progressPercent ?? 0,
        notes: normalizeOptionalText(input.notes),
      })
      .returning();

    const records = await this.listTrainingRecords(scope.companyId);
    return records.find((row) => row.id === created!.id)!;
  }

  async updateTrainingRecord(
    companyId: string,
    recordId: string,
    input: UpdateKnowledgeTrainingRecordRequest,
  ): Promise<KnowledgeTrainingRecordSummary> {
    const existing = await this.ensureTrainingRecord(companyId, recordId);
    const course = await this.ensureCourse(companyId, existing.courseId);

    const status = input.status ?? existing.status;
    const progressPercent = input.progressPercent ?? existing.progressPercent;
    const completedAt =
      status === 'completed' && !existing.completedAt
        ? new Date()
        : status === 'completed'
          ? existing.completedAt
          : null;
    const certificationExpiresAt =
      status === 'completed' && course.certificationRequired && course.certificationValidDays
        ? new Date(Date.now() + course.certificationValidDays * 24 * 60 * 60 * 1000)
        : existing.certificationExpiresAt;

    await this.deps.db
      .update(knowledgeTrainingRecords)
      .set({
        status,
        progressPercent,
        completedAt,
        certificationExpiresAt,
        notes: input.notes !== undefined ? normalizeOptionalText(input.notes) : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(knowledgeTrainingRecords.id, recordId), eq(knowledgeTrainingRecords.companyId, companyId)));

    const records = await this.listTrainingRecords(companyId);
    return records.find((row) => row.id === recordId)!;
  }

  async listPolicies(companyId: string, userPermissions: string[]): Promise<CompanyPolicySummary[]> {
    const rows = await this.deps.db.query.companyPolicies.findMany({
      where: eq(companyPolicies.companyId, companyId),
      with: { category: true, createdBy: true },
      orderBy: [desc(companyPolicies.updatedAt)],
    });

    return rows
      .filter((row) => this.canAccessContent(row.requiredPermissions, userPermissions))
      .map(toPolicySummary);
  }

  async getPolicy(companyId: string, policyId: string, userPermissions: string[]): Promise<CompanyPolicyDetail | null> {
    const row = await this.deps.db.query.companyPolicies.findFirst({
      where: and(eq(companyPolicies.id, policyId), eq(companyPolicies.companyId, companyId)),
      with: { category: true, createdBy: true, approvedBy: true },
    });

    if (!row || !this.canAccessContent(row.requiredPermissions, userPermissions)) {
      return null;
    }

    return toPolicyDetail(row);
  }

  async createPolicy(scope: TenantScope, input: CreateCompanyPolicyRequest): Promise<CompanyPolicyDetail> {
    const title = input.title.trim();
    const content = input.content.trim();
    if (!title || !content) {
      throw new KnowledgeError('VALIDATION_ERROR', 'Title and content are required');
    }

    const keywords = extractKeywords(title, content, input.keywords);
    const summary = input.summary?.trim() || generateSummary(content);

    const [created] = await this.deps.db
      .insert(companyPolicies)
      .values({
        companyId: scope.companyId,
        categoryId: input.categoryId ?? null,
        policyType: input.policyType,
        title,
        content,
        summary,
        effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        keywords,
        requiredPermissions: input.requiredPermissions ?? [],
        createdByUserId: scope.userId,
      })
      .returning();

    await this.createVersion(scope, 'policy', created!.id, 1, title, content, 'Initial version');

    return (await this.getPolicy(scope.companyId, created!.id, ['*']))!;
  }

  async updatePolicy(
    scope: TenantScope,
    policyId: string,
    input: UpdateCompanyPolicyRequest,
  ): Promise<CompanyPolicyDetail> {
    const existing = await this.ensurePolicy(scope.companyId, policyId);
    const title = input.title?.trim() ?? existing.title;
    const content = input.content?.trim() ?? existing.content;
    const keywords = extractKeywords(title, content, input.keywords ?? existing.keywords);
    const versionNumber = existing.versionNumber + 1;

    await this.deps.db
      .update(companyPolicies)
      .set({
        categoryId: input.categoryId !== undefined ? input.categoryId : undefined,
        policyType: input.policyType,
        title,
        content,
        summary: input.summary !== undefined ? normalizeOptionalText(input.summary) : existing.summary,
        effectiveDate: input.effectiveDate !== undefined ? (input.effectiveDate ? new Date(input.effectiveDate) : null) : undefined,
        expiryDate: input.expiryDate !== undefined ? (input.expiryDate ? new Date(input.expiryDate) : null) : undefined,
        keywords,
        versionNumber,
        requiredPermissions: input.requiredPermissions,
        status: 'draft',
        updatedAt: new Date(),
      })
      .where(and(eq(companyPolicies.id, policyId), eq(companyPolicies.companyId, scope.companyId)));

    await this.createVersion(
      scope,
      'policy',
      policyId,
      versionNumber,
      title,
      content,
      input.changeSummary ?? `Updated to version ${versionNumber}`,
    );

    return (await this.getPolicy(scope.companyId, policyId, ['*']))!;
  }

  async submitPolicy(scope: TenantScope, policyId: string): Promise<CompanyPolicyDetail> {
    await this.ensurePolicy(scope.companyId, policyId);
    await this.deps.db
      .update(companyPolicies)
      .set({ status: 'pending_approval', updatedAt: new Date() })
      .where(and(eq(companyPolicies.id, policyId), eq(companyPolicies.companyId, scope.companyId)));
    return (await this.getPolicy(scope.companyId, policyId, ['*']))!;
  }

  async publishPolicy(scope: TenantScope, policyId: string): Promise<CompanyPolicyDetail> {
    await this.ensurePolicy(scope.companyId, policyId);
    await this.deps.db
      .update(companyPolicies)
      .set({
        status: 'published',
        approvedByUserId: scope.userId,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(companyPolicies.id, policyId), eq(companyPolicies.companyId, scope.companyId)));
    return (await this.getPolicy(scope.companyId, policyId, ['*']))!;
  }

  async listVersionHistory(
    companyId: string,
    entityType: 'article' | 'sop' | 'policy',
    entityId: string,
  ): Promise<KnowledgeVersionSummary[]> {
    const rows = await this.deps.db.query.knowledgeVersions.findMany({
      where: and(
        eq(knowledgeVersions.companyId, companyId),
        eq(knowledgeVersions.entityType, entityType),
        eq(knowledgeVersions.entityId, entityId),
      ),
      with: { createdBy: true },
      orderBy: [desc(knowledgeVersions.versionNumber)],
    });

    return rows.map((row) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      versionNumber: row.versionNumber,
      title: row.title,
      changeSummary: row.changeSummary,
      createdByName: formatUserName(row.createdBy),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async searchKnowledge(
    companyId: string,
    input: KnowledgeSearchRequest,
    userPermissions: string[],
  ): Promise<KnowledgeSearchResult[]> {
    const query = input.query.trim().toLowerCase();
    if (!query) {
      return [];
    }

    const types = input.types ?? ['article', 'sop', 'policy', 'training', 'document'];
    const limit = Math.min(input.limit ?? 20, 50);
    const results: KnowledgeSearchResult[] = [];

    if (types.includes('article')) {
      const rows = await this.deps.db.query.knowledgeArticles.findMany({
        where: and(eq(knowledgeArticles.companyId, companyId), eq(knowledgeArticles.status, 'published')),
        with: { category: true },
      });

      for (const row of rows) {
        if (!this.canAccessContent(row.requiredPermissions, userPermissions)) continue;
        const score = scoreMatch(query, row.title, row.content, row.keywords);
        if (score > 0) {
          results.push({
            resultType: 'article',
            id: row.id,
            title: row.title,
            summary: row.summary,
            categoryName: row.category?.name ?? null,
            keywords: row.keywords,
            relevanceScore: score,
          });
        }
      }
    }

    if (types.includes('sop')) {
      const rows = await this.deps.db.query.sopDocuments.findMany({
        where: and(eq(sopDocuments.companyId, companyId), eq(sopDocuments.status, 'published')),
        with: { category: true },
      });

      for (const row of rows) {
        if (!this.canAccessContent(row.requiredPermissions, userPermissions)) continue;
        const score = scoreMatch(query, row.title, row.content, row.keywords);
        if (score > 0) {
          results.push({
            resultType: 'sop',
            id: row.id,
            title: row.title,
            summary: row.summary,
            categoryName: row.category?.name ?? null,
            keywords: row.keywords,
            relevanceScore: score,
          });
        }
      }
    }

    if (types.includes('policy')) {
      const rows = await this.deps.db.query.companyPolicies.findMany({
        where: and(eq(companyPolicies.companyId, companyId), eq(companyPolicies.status, 'published')),
        with: { category: true },
      });

      for (const row of rows) {
        if (!this.canAccessContent(row.requiredPermissions, userPermissions)) continue;
        const score = scoreMatch(query, row.title, row.content, row.keywords);
        if (score > 0) {
          results.push({
            resultType: 'policy',
            id: row.id,
            title: row.title,
            summary: row.summary,
            categoryName: row.category?.name ?? null,
            keywords: row.keywords,
            relevanceScore: score,
          });
        }
      }
    }

    if (types.includes('training')) {
      const rows = await this.deps.db.query.trainingCourses.findMany({
        where: and(eq(trainingCourses.companyId, companyId), eq(trainingCourses.status, 'active')),
        with: { category: true },
      });

      for (const row of rows) {
        const score = scoreMatch(query, row.title, row.description ?? '', row.skillTags);
        if (score > 0) {
          results.push({
            resultType: 'training',
            id: row.id,
            title: row.title,
            summary: row.description,
            categoryName: row.category?.name ?? null,
            keywords: row.skillTags,
            relevanceScore: score,
          });
        }
      }
    }

    if (types.includes('document')) {
      const rows = await this.deps.db.query.documents.findMany({
        where: eq(documents.companyId, companyId),
      });

      for (const row of rows) {
        const score = scoreMatch(query, row.title, row.description ?? '', []);
        if (score > 0) {
          results.push({
            resultType: 'document',
            id: row.id,
            title: row.title,
            summary: row.description,
            categoryName: null,
            keywords: [],
            relevanceScore: score,
          });
        }
      }
    }

    return results.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, limit);
  }

  async indexDocument(scope: TenantScope, input: IndexDocumentRequest): Promise<KnowledgeArticleDetail> {
    const document = await this.deps.db.query.documents.findFirst({
      where: and(eq(documents.id, input.documentId), eq(documents.companyId, scope.companyId)),
    });

    if (!document) {
      throw new KnowledgeError('NOT_FOUND', 'Document not found');
    }

    return this.createArticle(scope, {
      categoryId: input.categoryId ?? null,
      articleType: input.articleType ?? 'documentation',
      title: document.title,
      content: [
        `Indexed from document: ${document.fileName}`,
        document.description ? `Description: ${document.description}` : null,
        document.fileType ? `File type: ${document.fileType}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      documentId: document.id,
      status: 'draft',
    });
  }

  async listRecommendations(companyId: string): Promise<KnowledgeRecommendationSummary[]> {
    const rows = await this.deps.db.query.knowledgeRecommendations.findMany({
      where: and(
        eq(knowledgeRecommendations.companyId, companyId),
        inArray(knowledgeRecommendations.status, ['pending', 'accepted']),
      ),
      orderBy: [desc(knowledgeRecommendations.updatedAt)],
      limit: 50,
    });

    return rows.map(toRecommendationSummary);
  }

  async generateRecommendations(companyId: string): Promise<KnowledgeRecommendationSummary[]> {
    const [articles, sops, courses, records, stats] = await Promise.all([
      this.deps.db.query.knowledgeArticles.findMany({ where: eq(knowledgeArticles.companyId, companyId) }),
      this.deps.db.query.sopDocuments.findMany({ where: eq(sopDocuments.companyId, companyId) }),
      this.deps.db.query.trainingCourses.findMany({ where: eq(trainingCourses.companyId, companyId) }),
      this.deps.db.query.knowledgeTrainingRecords.findMany({ where: eq(knowledgeTrainingRecords.companyId, companyId) }),
      this.getStats(companyId),
    ]);

    const now = new Date();
    const signals: Array<{
      recommendationType: KnowledgeRecommendationSummary['recommendationType'];
      title: string;
      description: string;
      priority: string;
      context: Record<string, unknown>;
    }> = [];

    if (stats.publishedArticleCount === 0 && articles.length === 0) {
      signals.push({
        recommendationType: 'missing_documentation',
        title: 'Create knowledge base articles',
        description: 'No knowledge articles exist yet — consider documenting core procedures and FAQs.',
        priority: 'high',
        context: {},
      });
    }

    const outdatedSops = sops.filter(
      (row) =>
        row.status === 'published' &&
        row.updatedAt < new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
    );
    for (const sop of outdatedSops.slice(0, 5)) {
      signals.push({
        recommendationType: 'outdated_sop',
        title: `Review outdated SOP: ${sop.title}`,
        description: `SOP has not been updated in over 180 days — review for approval and republication.`,
        priority: 'medium',
        context: { sopId: sop.id },
      });
    }

    const expiredRecords = records.filter(
      (row) => row.certificationExpiresAt && row.certificationExpiresAt < now,
    );
    for (const record of expiredRecords.slice(0, 5)) {
      const course = courses.find((row) => row.id === record.courseId);
      signals.push({
        recommendationType: 'expired_certification',
        title: `Expired certification: ${course?.title ?? 'Training course'}`,
        description: 'Certification has expired — assign refresher training for approval.',
        priority: 'high',
        context: { recordId: record.id, courseId: record.courseId, userId: record.userId },
      });
    }

    const activeCourses = courses.filter((row) => row.status === 'active' && row.certificationRequired);
    if (activeCourses.length > 0 && records.filter((row) => row.status === 'completed').length === 0) {
      signals.push({
        recommendationType: 'training_requirement',
        title: 'Assign required training',
        description: `${activeCourses.length} active certification course(s) with no completed records — review training assignments.`,
        priority: 'medium',
        context: { courseIds: activeCourses.slice(0, 5).map((row) => row.id) },
      });
    }

    const draftArticles = articles.filter((row) => row.status === 'draft');
    if (draftArticles.length >= 3) {
      signals.push({
        recommendationType: 'frequently_requested',
        title: 'Publish pending knowledge articles',
        description: `${draftArticles.length} draft article(s) awaiting submission and approval.`,
        priority: 'low',
        context: { articleIds: draftArticles.slice(0, 5).map((row) => row.id) },
      });
    }

    const created: KnowledgeRecommendationSummary[] = [];
    for (const signal of signals.slice(0, 15)) {
      const [row] = await this.deps.db
        .insert(knowledgeRecommendations)
        .values({
          companyId,
          recommendationType: signal.recommendationType,
          title: signal.title,
          description: signal.description,
          priority: signal.priority,
          context: signal.context,
        })
        .returning();

      if (row) {
        created.push(toRecommendationSummary(row));
      }
    }

    return created;
  }

  async updateRecommendation(
    companyId: string,
    recommendationId: string,
    input: UpdateKnowledgeRecommendationRequest,
  ): Promise<KnowledgeRecommendationSummary> {
    const existing = await this.deps.db.query.knowledgeRecommendations.findFirst({
      where: and(
        eq(knowledgeRecommendations.id, recommendationId),
        eq(knowledgeRecommendations.companyId, companyId),
      ),
    });

    if (!existing) {
      throw new KnowledgeError('NOT_FOUND', 'Knowledge recommendation not found');
    }

    await this.deps.db
      .update(knowledgeRecommendations)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(knowledgeRecommendations.id, recommendationId));

    const row = await this.deps.db.query.knowledgeRecommendations.findFirst({
      where: eq(knowledgeRecommendations.id, recommendationId),
    });

    return toRecommendationSummary(row!);
  }

  async buildAuraContext(companyId: string): Promise<KnowledgeAuraContext> {
    const [stats, articles, sops, courses, policies, recommendations] = await Promise.all([
      this.getStats(companyId),
      this.deps.db.query.knowledgeArticles.findMany({
        where: eq(knowledgeArticles.companyId, companyId),
        orderBy: [desc(knowledgeArticles.updatedAt)],
        limit: 8,
      }),
      this.deps.db.query.sopDocuments.findMany({
        where: eq(sopDocuments.companyId, companyId),
        orderBy: [desc(sopDocuments.updatedAt)],
        limit: 8,
      }),
      this.deps.db.query.trainingCourses.findMany({
        where: and(eq(trainingCourses.companyId, companyId), eq(trainingCourses.status, 'active')),
        orderBy: [desc(trainingCourses.updatedAt)],
        limit: 8,
      }),
      this.deps.db.query.companyPolicies.findMany({
        where: and(eq(companyPolicies.companyId, companyId), eq(companyPolicies.status, 'published')),
        orderBy: [desc(companyPolicies.updatedAt)],
        limit: 8,
      }),
      this.listRecommendations(companyId),
    ]);

    return {
      stats,
      recentArticles: articles.map((row) => ({
        title: row.title,
        articleType: row.articleType,
        status: row.status,
      })),
      recentSops: sops.map((row) => ({
        title: row.title,
        department: row.department,
        status: row.status,
      })),
      activeTrainingCourses: courses.map((row) => ({
        title: row.title,
        contentType: row.contentType,
        skillTags: row.skillTags,
      })),
      publishedPolicies: policies.map((row) => ({
        title: row.title,
        policyType: row.policyType,
      })),
      topRecommendations: recommendations.slice(0, 8).map((row) => ({
        title: row.title,
        recommendationType: row.recommendationType,
        priority: row.priority,
      })),
      summary: `${stats.publishedArticleCount} published article(s), ${stats.publishedSopCount} SOP(s), ${stats.activeTrainingCourseCount} active training course(s), ${stats.pendingRecommendationCount} pending recommendation(s).`,
    };
  }

  private canAccessContent(requiredPermissions: string[], userPermissions: string[]): boolean {
    if (requiredPermissions.length === 0) {
      return true;
    }

    return hasAnyPermission(userPermissions, requiredPermissions);
  }

  private async createVersion(
    scope: TenantScope,
    entityType: 'article' | 'sop' | 'policy',
    entityId: string,
    versionNumber: number,
    title: string,
    content: string,
    changeSummary: string | null,
  ): Promise<void> {
    await this.deps.db.insert(knowledgeVersions).values({
      companyId: scope.companyId,
      entityType,
      entityId,
      versionNumber,
      title,
      content,
      changeSummary,
      createdByUserId: scope.userId,
    });
  }

  private async findRelatedArticleIds(
    companyId: string,
    keywords: string[],
    excludeIds: string[],
  ): Promise<string[]> {
    if (keywords.length === 0) {
      return [];
    }

    const rows = await this.deps.db.query.knowledgeArticles.findMany({
      where: and(eq(knowledgeArticles.companyId, companyId), eq(knowledgeArticles.status, 'published')),
      columns: { id: true, title: true, keywords: true },
      limit: 50,
    });

    return rows
      .filter((row) => !excludeIds.includes(row.id))
      .filter((row) => keywords.some((keyword) => row.keywords.includes(keyword) || row.title.toLowerCase().includes(keyword)))
      .slice(0, 5)
      .map((row) => row.id);
  }

  private async getCategoryArticleCounts(companyId: string): Promise<Map<string, number>> {
    const rows = await this.deps.db
      .select({
        categoryId: knowledgeArticles.categoryId,
        count: sql<number>`count(*)::int`,
      })
      .from(knowledgeArticles)
      .where(eq(knowledgeArticles.companyId, companyId))
      .groupBy(knowledgeArticles.categoryId);

    const map = new Map<string, number>();
    for (const row of rows) {
      if (row.categoryId) {
        map.set(row.categoryId, row.count);
      }
    }

    return map;
  }

  private async ensureCategory(companyId: string, categoryId: string) {
    const row = await this.deps.db.query.knowledgeCategories.findFirst({
      where: and(eq(knowledgeCategories.id, categoryId), eq(knowledgeCategories.companyId, companyId)),
    });

    if (!row) {
      throw new KnowledgeError('NOT_FOUND', 'Category not found');
    }

    return row;
  }

  private async ensureArticle(companyId: string, articleId: string) {
    const row = await this.deps.db.query.knowledgeArticles.findFirst({
      where: and(eq(knowledgeArticles.id, articleId), eq(knowledgeArticles.companyId, companyId)),
    });

    if (!row) {
      throw new KnowledgeError('NOT_FOUND', 'Article not found');
    }

    return row;
  }

  private async ensureSop(companyId: string, sopId: string) {
    const row = await this.deps.db.query.sopDocuments.findFirst({
      where: and(eq(sopDocuments.id, sopId), eq(sopDocuments.companyId, companyId)),
    });

    if (!row) {
      throw new KnowledgeError('NOT_FOUND', 'SOP not found');
    }

    return row;
  }

  private async ensureCourse(companyId: string, courseId: string) {
    const row = await this.deps.db.query.trainingCourses.findFirst({
      where: and(eq(trainingCourses.id, courseId), eq(trainingCourses.companyId, companyId)),
    });

    if (!row) {
      throw new KnowledgeError('NOT_FOUND', 'Training course not found');
    }

    return row;
  }

  private async ensurePolicy(companyId: string, policyId: string) {
    const row = await this.deps.db.query.companyPolicies.findFirst({
      where: and(eq(companyPolicies.id, policyId), eq(companyPolicies.companyId, companyId)),
    });

    if (!row) {
      throw new KnowledgeError('NOT_FOUND', 'Policy not found');
    }

    return row;
  }

  private async ensureTrainingRecord(companyId: string, recordId: string) {
    const row = await this.deps.db.query.knowledgeTrainingRecords.findFirst({
      where: and(eq(knowledgeTrainingRecords.id, recordId), eq(knowledgeTrainingRecords.companyId, companyId)),
    });

    if (!row) {
      throw new KnowledgeError('NOT_FOUND', 'Training record not found');
    }

    return row;
  }
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractKeywords(title: string, content: string, existing: string[] = []): string[] {
  const tokens = `${title} ${content}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 3);

  const unique = new Set([...existing.map((keyword) => keyword.toLowerCase()), ...tokens]);
  return [...unique].slice(0, 20);
}

function generateSummary(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length <= 200 ? normalized : `${normalized.slice(0, 197)}...`;
}

function scoreMatch(query: string, title: string, body: string, keywords: string[]): number {
  const haystack = `${title} ${body} ${keywords.join(' ')}`.toLowerCase();
  if (haystack.includes(query)) {
    return title.toLowerCase().includes(query) ? 100 : 60;
  }

  const terms = query.split(/\s+/).filter(Boolean);
  const matched = terms.filter((term) => haystack.includes(term)).length;
  return matched > 0 ? matched * 20 : 0;
}

function formatUserName(user: typeof users.$inferSelect | null | undefined): string {
  if (!user) return 'Unknown';
  return `${user.firstName} ${user.lastName}`.trim();
}

function toArticleSummary(
  row: typeof knowledgeArticles.$inferSelect & {
    category?: typeof knowledgeCategories.$inferSelect | null;
    createdBy?: typeof users.$inferSelect | null;
  },
): KnowledgeArticleSummary {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    articleType: row.articleType,
    title: row.title,
    summary: row.summary,
    keywords: row.keywords,
    status: row.status,
    versionNumber: row.versionNumber,
    documentId: row.documentId,
    relatedArticleIds: row.relatedArticleIds,
    requiredPermissions: row.requiredPermissions,
    createdByName: formatUserName(row.createdBy),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toArticleDetail(
  row: typeof knowledgeArticles.$inferSelect & {
    category?: typeof knowledgeCategories.$inferSelect | null;
    createdBy?: typeof users.$inferSelect | null;
    approvedBy?: typeof users.$inferSelect | null;
  },
): KnowledgeArticleDetail {
  return {
    ...toArticleSummary(row),
    content: row.content,
    approvedByName: formatUserName(row.approvedBy),
  };
}

function toSopSummary(
  row: typeof sopDocuments.$inferSelect & {
    category?: typeof knowledgeCategories.$inferSelect | null;
    createdBy?: typeof users.$inferSelect | null;
  },
): SopDocumentSummary {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    title: row.title,
    summary: row.summary,
    department: row.department,
    status: row.status,
    versionNumber: row.versionNumber,
    effectiveDate: row.effectiveDate?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    keywords: row.keywords,
    requiredPermissions: row.requiredPermissions,
    createdByName: formatUserName(row.createdBy),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toSopDetail(
  row: typeof sopDocuments.$inferSelect & {
    category?: typeof knowledgeCategories.$inferSelect | null;
    createdBy?: typeof users.$inferSelect | null;
    approvedBy?: typeof users.$inferSelect | null;
  },
): SopDocumentDetail {
  return {
    ...toSopSummary(row),
    content: row.content,
    approvedByName: formatUserName(row.approvedBy),
  };
}

function toTrainingCourseSummary(
  row: typeof trainingCourses.$inferSelect & {
    category?: typeof knowledgeCategories.$inferSelect | null;
    createdBy?: typeof users.$inferSelect | null;
    records?: Array<typeof knowledgeTrainingRecords.$inferSelect>;
  },
): TrainingCourseSummary {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    title: row.title,
    description: row.description,
    contentType: row.contentType,
    contentUrl: row.contentUrl,
    documentId: row.documentId,
    skillTags: row.skillTags,
    certificationRequired: row.certificationRequired,
    certificationValidDays: row.certificationValidDays,
    status: row.status,
    createdByName: formatUserName(row.createdBy),
    recordCount: row.records?.length ?? 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toKnowledgeTrainingRecordSummary(
  row: typeof knowledgeTrainingRecords.$inferSelect & {
    course?: typeof trainingCourses.$inferSelect | null;
    user?: typeof users.$inferSelect | null;
  },
): KnowledgeTrainingRecordSummary {
  return {
    id: row.id,
    courseId: row.courseId,
    courseTitle: row.course?.title ?? 'Unknown',
    userId: row.userId,
    userName: formatUserName(row.user),
    status: row.status,
    progressPercent: row.progressPercent,
    completedAt: row.completedAt?.toISOString() ?? null,
    certificationExpiresAt: row.certificationExpiresAt?.toISOString() ?? null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPolicySummary(
  row: typeof companyPolicies.$inferSelect & {
    category?: typeof knowledgeCategories.$inferSelect | null;
    createdBy?: typeof users.$inferSelect | null;
  },
): CompanyPolicySummary {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    policyType: row.policyType,
    title: row.title,
    summary: row.summary,
    status: row.status,
    versionNumber: row.versionNumber,
    effectiveDate: row.effectiveDate?.toISOString() ?? null,
    expiryDate: row.expiryDate?.toISOString() ?? null,
    keywords: row.keywords,
    requiredPermissions: row.requiredPermissions,
    createdByName: formatUserName(row.createdBy),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPolicyDetail(
  row: typeof companyPolicies.$inferSelect & {
    category?: typeof knowledgeCategories.$inferSelect | null;
    createdBy?: typeof users.$inferSelect | null;
    approvedBy?: typeof users.$inferSelect | null;
  },
): CompanyPolicyDetail {
  return {
    ...toPolicySummary(row),
    content: row.content,
    approvedByName: formatUserName(row.approvedBy),
  };
}

function toRecommendationSummary(
  row: typeof knowledgeRecommendations.$inferSelect,
): KnowledgeRecommendationSummary {
  return {
    id: row.id,
    recommendationType: row.recommendationType,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    context: (row.context as Record<string, unknown>) ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
