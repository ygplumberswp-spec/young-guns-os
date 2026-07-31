export type KnowledgeArticleType =
  | 'article'
  | 'procedure'
  | 'documentation'
  | 'troubleshooting'
  | 'technical_reference'
  | 'internal_note'
  | 'faq';

export type KnowledgeContentStatus = 'draft' | 'pending_approval' | 'published' | 'archived';

export type KnowledgeEntityType = 'article' | 'sop' | 'policy';

export type PolicyType = 'safety' | 'hr' | 'operational' | 'financial' | 'compliance';

export type TrainingContentType = 'video' | 'pdf' | 'manual' | 'article' | 'other';

export type TrainingCourseStatus = 'draft' | 'active' | 'archived';

export type TrainingRecordStatus = 'not_started' | 'in_progress' | 'completed' | 'expired';

export type KnowledgeRecommendationType =
  | 'missing_documentation'
  | 'outdated_sop'
  | 'expired_certification'
  | 'training_requirement'
  | 'frequently_requested';

export type KnowledgeRecommendationStatus = 'pending' | 'accepted' | 'dismissed' | 'completed';

export type KnowledgeCategorySummary = {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  articleCount: number;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeArticleSummary = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  articleType: KnowledgeArticleType;
  title: string;
  summary: string | null;
  keywords: string[];
  status: KnowledgeContentStatus;
  versionNumber: number;
  documentId: string | null;
  relatedArticleIds: string[];
  requiredPermissions: string[];
  createdByName: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeArticleDetail = KnowledgeArticleSummary & {
  content: string;
  approvedByName: string | null;
};

export type KnowledgeVersionSummary = {
  id: string;
  entityType: KnowledgeEntityType;
  entityId: string;
  versionNumber: number;
  title: string;
  changeSummary: string | null;
  createdByName: string;
  createdAt: string;
};

export type SopDocumentSummary = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  title: string;
  summary: string | null;
  department: string | null;
  status: KnowledgeContentStatus;
  versionNumber: number;
  effectiveDate: string | null;
  archivedAt: string | null;
  keywords: string[];
  requiredPermissions: string[];
  createdByName: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SopDocumentDetail = SopDocumentSummary & {
  content: string;
  approvedByName: string | null;
};

export type TrainingCourseSummary = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  title: string;
  description: string | null;
  contentType: TrainingContentType;
  contentUrl: string | null;
  documentId: string | null;
  skillTags: string[];
  certificationRequired: boolean;
  certificationValidDays: number | null;
  status: TrainingCourseStatus;
  createdByName: string;
  recordCount: number;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeTrainingRecordSummary = {
  id: string;
  courseId: string;
  courseTitle: string;
  userId: string;
  userName: string;
  status: TrainingRecordStatus;
  progressPercent: number;
  completedAt: string | null;
  certificationExpiresAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CompanyPolicySummary = {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  policyType: PolicyType;
  title: string;
  summary: string | null;
  status: KnowledgeContentStatus;
  versionNumber: number;
  effectiveDate: string | null;
  expiryDate: string | null;
  keywords: string[];
  requiredPermissions: string[];
  createdByName: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CompanyPolicyDetail = CompanyPolicySummary & {
  content: string;
  approvedByName: string | null;
};

export type KnowledgeSearchResult = {
  resultType: 'article' | 'sop' | 'policy' | 'training' | 'document';
  id: string;
  title: string;
  summary: string | null;
  categoryName: string | null;
  keywords: string[];
  relevanceScore: number;
};

export type KnowledgeRecommendationSummary = {
  id: string;
  recommendationType: KnowledgeRecommendationType;
  title: string;
  description: string;
  priority: string;
  status: KnowledgeRecommendationStatus;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeStats = {
  articleCount: number;
  publishedArticleCount: number;
  sopCount: number;
  publishedSopCount: number;
  trainingCourseCount: number;
  activeTrainingCourseCount: number;
  policyCount: number;
  publishedPolicyCount: number;
  pendingRecommendationCount: number;
  expiredCertificationCount: number;
};

export type KnowledgeAuraContext = {
  stats: KnowledgeStats;
  recentArticles: Array<{
    title: string;
    articleType: KnowledgeArticleType;
    status: KnowledgeContentStatus;
  }>;
  recentSops: Array<{ title: string; department: string | null; status: KnowledgeContentStatus }>;
  activeTrainingCourses: Array<{
    title: string;
    contentType: TrainingContentType;
    skillTags: string[];
  }>;
  publishedPolicies: Array<{ title: string; policyType: PolicyType }>;
  topRecommendations: Array<{
    title: string;
    recommendationType: KnowledgeRecommendationType;
    priority: string;
  }>;
  summary: string;
};

export type CreateKnowledgeCategoryRequest = {
  name: string;
  description?: string | null;
  parentId?: string | null;
};

export type UpdateKnowledgeCategoryRequest = Partial<CreateKnowledgeCategoryRequest>;

export type CreateKnowledgeArticleRequest = {
  categoryId?: string | null;
  articleType?: KnowledgeArticleType;
  title: string;
  content: string;
  summary?: string | null;
  keywords?: string[];
  documentId?: string | null;
  relatedArticleIds?: string[];
  requiredPermissions?: string[];
  status?: KnowledgeContentStatus;
};

export type UpdateKnowledgeArticleRequest = Partial<
  Omit<CreateKnowledgeArticleRequest, 'status'>
> & {
  changeSummary?: string | null;
};

export type SubmitKnowledgeContentRequest = {
  status: 'pending_approval';
};

export type PublishKnowledgeContentRequest = {
  status: 'published';
};

export type CreateSopDocumentRequest = {
  categoryId?: string | null;
  title: string;
  content: string;
  summary?: string | null;
  department?: string | null;
  effectiveDate?: string | null;
  keywords?: string[];
  requiredPermissions?: string[];
};

export type UpdateSopDocumentRequest = Partial<CreateSopDocumentRequest> & {
  changeSummary?: string | null;
};

export type CreateTrainingCourseRequest = {
  categoryId?: string | null;
  title: string;
  description?: string | null;
  contentType?: TrainingContentType;
  contentUrl?: string | null;
  documentId?: string | null;
  skillTags?: string[];
  certificationRequired?: boolean;
  certificationValidDays?: number | null;
  status?: TrainingCourseStatus;
};

export type UpdateTrainingCourseRequest = Partial<CreateTrainingCourseRequest>;

export type CreateKnowledgeTrainingRecordRequest = {
  courseId: string;
  userId: string;
  status?: TrainingRecordStatus;
  progressPercent?: number;
  notes?: string | null;
};

export type UpdateKnowledgeTrainingRecordRequest = {
  status?: TrainingRecordStatus;
  progressPercent?: number;
  notes?: string | null;
};

export type CreateCompanyPolicyRequest = {
  categoryId?: string | null;
  policyType: PolicyType;
  title: string;
  content: string;
  summary?: string | null;
  effectiveDate?: string | null;
  expiryDate?: string | null;
  keywords?: string[];
  requiredPermissions?: string[];
};

export type UpdateCompanyPolicyRequest = Partial<CreateCompanyPolicyRequest> & {
  changeSummary?: string | null;
};

export type KnowledgeSearchRequest = {
  query: string;
  types?: Array<'article' | 'sop' | 'policy' | 'training' | 'document'>;
  limit?: number;
};

export type UpdateKnowledgeRecommendationRequest = {
  status: KnowledgeRecommendationStatus;
};

export type IndexDocumentRequest = {
  documentId: string;
  categoryId?: string | null;
  articleType?: KnowledgeArticleType;
};
