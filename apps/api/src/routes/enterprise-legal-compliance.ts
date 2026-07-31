import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseLegalComplianceService } from '../services/enterprise-legal-compliance.service.js';
import { EnterpriseLegalComplianceError } from '../services/enterprise-legal-compliance.service.js';
import type { PortalAuthService } from '../services/portal-auth.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  createPortalAuthMiddleware,
  type PortalAuthenticatedRequest,
} from '../middleware/portal-auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  globalPolicies: z.record(z.unknown()).optional(),
  providerAdapterTemplates: z.record(z.unknown()).optional(),
  jurisdictionTemplates: z.record(z.unknown()).optional(),
  riskMethodology: z.record(z.unknown()).optional(),
  retentionTemplates: z.record(z.unknown()).optional(),
  privacyDefaults: z.record(z.unknown()).optional(),
  clauseLibraryTemplates: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const categorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  categoryKey: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  config: z.record(z.unknown()).optional(),
});

const jurisdictionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  country: z.string().trim().max(100).optional(),
  provinceOrState: z.string().trim().max(100).optional(),
  municipalityOrRegion: z.string().trim().max(200).optional(),
  industry: z.string().trim().max(200).optional(),
  config: z.record(z.unknown()).optional(),
});

const contractSchema = z.object({
  title: z.string().trim().min(1).max(200),
  categoryId: z.string().uuid().optional(),
  jurisdictionId: z.string().uuid().optional(),
  contractNumber: z.string().trim().max(100).optional(),
  contractType: z.string().trim().max(100).optional(),
  counterpartyName: z.string().trim().max(200).optional(),
  counterpartyId: z.string().uuid().optional(),
  counterpartyType: z.string().trim().max(100).optional(),
  businessUnit: z.string().trim().max(200).optional(),
  effectiveDate: z.string().optional(),
  expiryDate: z.string().optional(),
  renewalTerms: z.string().trim().max(2000).optional(),
  noticePeriodDays: z.number().int().min(0).optional(),
  contractValueCents: z.number().int().min(0).optional(),
  currency: z.string().trim().max(10).optional(),
  paymentTerms: z.string().trim().max(500).optional(),
  governingJurisdiction: z.string().trim().max(200).optional(),
  linkedMetadata: z.record(z.unknown()).optional(),
});

const contractLifecycleSchema = z.object({
  status: z.enum([
    'request',
    'draft',
    'internal_review',
    'external_review',
    'negotiation',
    'pending_approval',
    'approved',
    'signature',
    'active',
    'amendment',
    'renewal',
    'suspended',
    'expired',
    'terminated',
    'archived',
  ]),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  requiresApproval: z.boolean().optional(),
});

const clauseSchema = z.object({
  clauseKey: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  jurisdictionId: z.string().uuid().optional(),
  isMandatory: z.boolean().optional(),
  isApproved: z.boolean().optional(),
});

const signatureProviderSchema = z.object({
  providerType: z.enum([
    'docusign',
    'adobe_sign',
    'dropbox_sign',
    'pandadoc',
    'signnow',
    'zoho_sign',
    'onespan',
    'microsoft',
    'manual_upload',
    'generic_rest',
    'webhook',
    'custom',
  ]),
  providerKey: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  endpointUrl: z.string().url().optional(),
  credentialsVaultKey: z.string().trim().max(200).optional(),
  isPrimary: z.boolean().optional(),
  signerRoleMappings: z.record(z.unknown()).optional(),
  fieldMappings: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const contractAnalysisSchema = z.object({
  analysisType: z.string().trim().min(1).max(200),
  content: z.string().trim().max(50000).optional(),
});

const obligationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  contractId: z.string().uuid().optional(),
  description: z.string().trim().max(4000).optional(),
  dueDate: z.string().optional(),
  frequency: z.string().trim().max(100).optional(),
  sourceType: z.string().trim().max(100).optional(),
});

const riskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z
    .enum([
      'strategic',
      'operational',
      'financial',
      'legal',
      'compliance',
      'cybersecurity',
      'data_privacy',
      'supplier',
      'customer',
      'workforce',
      'health_safety',
      'fleet',
      'asset',
      'environmental',
      'reputation',
      'project',
      'custom',
    ])
    .optional(),
  customCategoryName: z.string().trim().max(200).optional(),
  description: z.string().trim().max(4000).optional(),
  likelihood: z.number().int().min(1).max(5).optional(),
  impact: z.number().int().min(1).max(5).optional(),
  businessArea: z.string().trim().max(200).optional(),
  treatmentPlan: z.string().trim().max(4000).optional(),
  reviewDate: z.string().optional(),
});

const controlSchema = z.object({
  controlKey: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  objective: z.string().trim().max(2000).optional(),
  processArea: z.string().trim().max(200).optional(),
  frequency: z.string().trim().max(100).optional(),
});

const policySchema = z.object({
  title: z.string().trim().min(1).max(200),
  policyKey: z.string().trim().min(1).max(100),
  description: z.string().trim().max(4000).optional(),
  content: z.string().trim().max(50000).optional(),
  audience: z.string().trim().max(200).optional(),
  effectiveDate: z.string().optional(),
  reviewCycleDays: z.number().int().min(1).optional(),
});

const legalMatterSchema = z.object({
  matterType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  priority: z.string().trim().max(50).optional(),
  counterpartyName: z.string().trim().max(200).optional(),
  deadlineDate: z.string().optional(),
});

const insurancePolicySchema = z.object({
  policyNumber: z.string().trim().min(1).max(100),
  coverageType: z.string().trim().min(1).max(200),
  insurerName: z.string().trim().max(200).optional(),
  expiryDate: z.string().optional(),
  premiumCents: z.number().int().min(0).optional(),
});

const insuranceClaimSchema = z.object({
  policyId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  claimNumber: z.string().trim().max(100).optional(),
  claimAmountCents: z.number().int().min(0).optional(),
});

const privacyRequestSchema = z.object({
  requestType: z.enum(['access', 'correction', 'deletion', 'portability', 'objection']),
  customerId: z.string().uuid().optional(),
  subjectName: z.string().trim().max(200).optional(),
  description: z.string().trim().max(4000).optional(),
});

const legalDraftSchema = z.object({
  draftType: z.enum([
    'contract_summary',
    'policy_document',
    'compliance_report',
    'risk_report',
    'legal_matter_summary',
    'customer_notice',
    'supplier_notice',
    'internal_communication',
    'control_improvement',
    'clause_recommendation',
  ]),
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  payload: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
});

type RouterDeps = {
  enterpriseLegalComplianceService: EnterpriseLegalComplianceService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
  portalAuthService: PortalAuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function getPortalAuth(req: import('express').Request) {
  return (req as PortalAuthenticatedRequest).portalAuth;
}

function getRouteParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0]! : value;
}

function staffScope(req: import('express').Request) {
  const auth = getAuth(req);
  return { companyId: auth.companyId, userId: auth.userId };
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseLegalComplianceError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'VALIDATION_ERROR' || error.code === 'CONFLICT'
          ? 400
          : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseLegalComplianceRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    authService: deps.authService,
  });
  const requirePortalAuth = createPortalAuthMiddleware({
    jwtSecret: deps.jwtSecret,
    portalAuthService: deps.portalAuthService,
  });
  const requireRead = requireAnyPermission(
    'legal_compliance:read',
    'legal_compliance:manage',
    'documents:read',
  );
  const requireWrite = requireAnyPermission('legal_compliance:write', 'legal_compliance:manage');
  const requireManage = requireAnyPermission('legal_compliance:manage', 'platform:manage');

  router.get('/dashboard', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const dashboard = await deps.enterpriseLegalComplianceService.getDashboard(auth.companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/compliance-monitoring', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const complianceMonitoring =
        await deps.enterpriseLegalComplianceService.getComplianceMonitoring(auth.companyId);
      res.json({ data: { complianceMonitoring } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/portal', requirePortalAuth, async (req, res) => {
    try {
      const portalAuth = getPortalAuth(req);
      const summary = await deps.enterpriseLegalComplianceService.getPortalLegalSummary(
        portalAuth.companyId,
        portalAuth.customerId,
      );
      res.json({ data: { summary } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/employee', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const summary = await deps.enterpriseLegalComplianceService.getEmployeeLegalSummary(
        staffScope(req),
      );
      res.json({ data: { summary } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const platformConfig = await deps.enterpriseLegalComplianceService.getPlatformConfig(
        auth.companyId,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireStaffAuth, requireManage, async (req, res) => {
    const parsed = platformConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid platform config' } });
      return;
    }
    try {
      const platformConfig = await deps.enterpriseLegalComplianceService.updatePlatformConfig(
        staffScope(req),
        parsed.data,
      );
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/categories', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const categories = await deps.enterpriseLegalComplianceService.listCategories(auth.companyId);
      res.json({ data: { categories } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/categories', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid category' } });
      return;
    }
    try {
      const category = await deps.enterpriseLegalComplianceService.createCategory(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { category } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/jurisdictions', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const jurisdictions = await deps.enterpriseLegalComplianceService.listJurisdictions(
        auth.companyId,
      );
      res.json({ data: { jurisdictions } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/jurisdictions', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = jurisdictionSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid jurisdiction' } });
      return;
    }
    try {
      const jurisdiction = await deps.enterpriseLegalComplianceService.createJurisdiction(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { jurisdiction } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/contracts', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const contracts = await deps.enterpriseLegalComplianceService.listContracts(auth.companyId);
      res.json({ data: { contracts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/contracts', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = contractSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid contract' } });
      return;
    }
    try {
      const contract = await deps.enterpriseLegalComplianceService.createContract(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { contract } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post(
    '/contracts/:contractId/lifecycle',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = contractLifecycleSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid contract lifecycle' } });
        return;
      }
      try {
        const contract = await deps.enterpriseLegalComplianceService.advanceContractLifecycle(
          staffScope(req),
          {
            contractId: getRouteParam(req.params.contractId),
            ...parsed.data,
          },
        );
        res.status(201).json({ data: { contract } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/contracts/:contractId/approve',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      try {
        const contract = await deps.enterpriseLegalComplianceService.approveContract(
          staffScope(req),
          getRouteParam(req.params.contractId),
        );
        res.json({ data: { contract } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/contracts/:contractId/execute',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      try {
        const contract = await deps.enterpriseLegalComplianceService.executeContract(
          staffScope(req),
          getRouteParam(req.params.contractId),
        );
        res.json({ data: { contract } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/clauses', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const clauses = await deps.enterpriseLegalComplianceService.listClauses(auth.companyId);
      res.json({ data: { clauses } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/clauses', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = clauseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid clause' } });
      return;
    }
    try {
      const clause = await deps.enterpriseLegalComplianceService.createClause(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { clause } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/signature/providers', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const providers = await deps.enterpriseLegalComplianceService.listSignatureProviders(
        auth.companyId,
      );
      res.json({ data: { providers } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/signature/providers', requireStaffAuth, requireManage, async (req, res) => {
    const parsed = signatureProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid signature provider' } });
      return;
    }
    try {
      const provider = await deps.enterpriseLegalComplianceService.createSignatureProvider(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { provider } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post(
    '/signature/providers/:providerId/test',
    requireStaffAuth,
    requireManage,
    async (req, res) => {
      try {
        const provider = await deps.enterpriseLegalComplianceService.testSignatureProvider(
          staffScope(req),
          getRouteParam(req.params.providerId),
        );
        res.json({ data: { provider } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    '/contracts/:contractId/analyses',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      const parsed = contractAnalysisSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid contract analysis request' },
        });
        return;
      }
      try {
        const analysis = await deps.enterpriseLegalComplianceService.requestContractAnalysis(
          staffScope(req),
          getRouteParam(req.params.contractId),
          parsed.data,
        );
        res.status(201).json({ data: { analysis } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/analyses', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const contractId =
        typeof req.query.contractId === 'string' ? req.query.contractId : undefined;
      const analyses = await deps.enterpriseLegalComplianceService.listContractAnalyses(
        auth.companyId,
        contractId,
      );
      res.json({ data: { analyses } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/obligations', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const obligations = await deps.enterpriseLegalComplianceService.listObligations(
        auth.companyId,
      );
      res.json({ data: { obligations } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/obligations', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = obligationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid obligation' } });
      return;
    }
    try {
      const obligation = await deps.enterpriseLegalComplianceService.createObligation(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { obligation } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post(
    '/obligations/:obligationId/complete',
    requireStaffAuth,
    requireWrite,
    async (req, res) => {
      try {
        const obligation = await deps.enterpriseLegalComplianceService.completeObligation(
          staffScope(req),
          getRouteParam(req.params.obligationId),
        );
        res.json({ data: { obligation } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/risks', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const risks = await deps.enterpriseLegalComplianceService.listRisks(auth.companyId);
      res.json({ data: { risks } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/risks', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = riskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid risk' } });
      return;
    }
    try {
      const risk = await deps.enterpriseLegalComplianceService.createRisk(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { risk } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/controls', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const controls = await deps.enterpriseLegalComplianceService.listControls(auth.companyId);
      res.json({ data: { controls } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/controls', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = controlSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid control' } });
      return;
    }
    try {
      const control = await deps.enterpriseLegalComplianceService.createControl(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { control } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/policies', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const policies = await deps.enterpriseLegalComplianceService.listPolicies(auth.companyId);
      res.json({ data: { policies } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/policies', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = policySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid policy' } });
      return;
    }
    try {
      const policy = await deps.enterpriseLegalComplianceService.createPolicy(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { policy } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/policies/:policyId/publish', requireStaffAuth, requireManage, async (req, res) => {
    try {
      const policy = await deps.enterpriseLegalComplianceService.publishPolicy(
        staffScope(req),
        getRouteParam(req.params.policyId),
      );
      res.json({ data: { policy } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post(
    '/policies/:policyId/acknowledge',
    requireStaffAuth,
    requireRead,
    async (req, res) => {
      try {
        await deps.enterpriseLegalComplianceService.acknowledgePolicy(
          staffScope(req),
          getRouteParam(req.params.policyId),
        );
        res.json({ data: { acknowledged: true } });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get('/legal-matters', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const legalMatters = await deps.enterpriseLegalComplianceService.listLegalMatters(
        auth.companyId,
      );
      res.json({ data: { legalMatters } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/legal-matters', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = legalMatterSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid legal matter' } });
      return;
    }
    try {
      const legalMatter = await deps.enterpriseLegalComplianceService.createLegalMatter(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { legalMatter } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/insurance/policies', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const policies = await deps.enterpriseLegalComplianceService.listInsurancePolicies(
        auth.companyId,
      );
      res.json({ data: { policies } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/insurance/policies', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = insurancePolicySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid insurance policy' } });
      return;
    }
    try {
      const policy = await deps.enterpriseLegalComplianceService.createInsurancePolicy(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { policy } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/insurance/claims', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const claims = await deps.enterpriseLegalComplianceService.listInsuranceClaims(
        auth.companyId,
      );
      res.json({ data: { claims } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/insurance/claims', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = insuranceClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid insurance claim' } });
      return;
    }
    try {
      const claim = await deps.enterpriseLegalComplianceService.createInsuranceClaim(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { claim } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/privacy/requests', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const customerId =
        typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
      const privacyRequests = await deps.enterpriseLegalComplianceService.listPrivacyRequests(
        auth.companyId,
        {
          status,
          customerId,
        },
      );
      res.json({ data: { privacyRequests } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/privacy/requests', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = privacyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid privacy request' } });
      return;
    }
    try {
      const privacyRequest = await deps.enterpriseLegalComplianceService.createPrivacyRequest(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { privacyRequest } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/legal-holds', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const legalHolds = await deps.enterpriseLegalComplianceService.listLegalHolds(auth.companyId);
      res.json({ data: { legalHolds } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/evidence', requireStaffAuth, requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const evidence = await deps.enterpriseLegalComplianceService.listEvidence(auth.companyId);
      res.json({ data: { evidence } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireStaffAuth, requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterpriseLegalComplianceService.captureAnalytics(
        staffScope(req),
      );
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/hr-drafts', requireStaffAuth, requireWrite, async (req, res) => {
    const parsed = legalDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid legal action draft' } });
      return;
    }
    try {
      const draft = await deps.enterpriseLegalComplianceService.createLegalActionDraft(
        staffScope(req),
        parsed.data,
      );
      res.status(201).json({ data: { draft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
