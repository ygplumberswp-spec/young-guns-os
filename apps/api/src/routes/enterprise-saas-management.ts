import { Router } from 'express';
import { z } from 'zod';
import type { EnterpriseSaasManagementService } from '../services/enterprise-saas-management.service.js';
import { EnterpriseSaasManagementError } from '../services/enterprise-saas-management.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/rbac.js';

const platformConfigSchema = z.object({
  billingPolicy: z.record(z.unknown()).optional(),
  provisioningPolicy: z.record(z.unknown()).optional(),
  licensingPolicy: z.record(z.unknown()).optional(),
  partnerPolicy: z.record(z.unknown()).optional(),
  usagePolicy: z.record(z.unknown()).optional(),
  auditRetentionDays: z.number().int().min(1).optional(),
});

const licenseSchema = z.object({
  targetCompanyId: z.string().uuid(),
  licenseKey: z.string().trim().min(1).max(200),
  licenseType: z.string().trim().min(1).max(100),
  seatLimit: z.number().int().optional(),
  deviceTrackingEnabled: z.boolean().optional(),
  expiresAt: z.string().optional(),
});

const paymentProviderSchema = z.object({
  providerKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
  supportedCurrencies: z.array(z.string()).optional(),
});

const billingPolicySchema = z.object({
  policyKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  retryPolicy: z.record(z.unknown()).optional(),
  prorationPolicy: z.record(z.unknown()).optional(),
  taxPolicy: z.record(z.unknown()).optional(),
  currencyPolicy: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
});

const couponSchema = z.object({
  couponCode: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  discountType: z.string().trim().min(1).max(50),
  discountValue: z.number().int(),
  currency: z.string().optional(),
  maxRedemptions: z.number().int().optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
});

const addOnSchema = z.object({
  addOnKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  priceCents: z.number().int().optional(),
  currency: z.string().optional(),
  billingInterval: z.string().optional(),
  features: z.array(z.string()).optional(),
  limits: z.record(z.unknown()).optional(),
});

const partnerSchema = z.object({
  partnerCompanyId: z.string().uuid(),
  partnerType: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  whiteLabelEnabled: z.boolean().optional(),
  pricingPolicy: z.record(z.unknown()).optional(),
});

const usageThresholdSchema = z.object({
  targetCompanyId: z.string().uuid().optional(),
  metricKey: z.string().trim().min(1).max(100),
  warningPercent: z.number().int().optional(),
  criticalPercent: z.number().int().optional(),
  limitValue: z.number().int().optional(),
  config: z.record(z.unknown()).optional(),
});

const featureAccessSchema = z.object({
  featureKey: z.string().trim().min(1).max(200),
  scopeType: z.string().trim().min(1).max(100),
  scopeRef: z.string().trim().max(200).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

const draftSchema = z.object({
  draftType: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  sourceRecords: z.record(z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),
});

const provisionTenantSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  planId: z.string().uuid().optional(),
  branchLabel: z.string().trim().max(200).optional(),
});

const createPlanSchema = z.object({
  planKey: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000),
  tier: z.enum(['free_trial', 'starter', 'professional', 'enterprise']),
  priceCents: z.number().int().optional(),
  billingInterval: z.enum(['monthly', 'annual']).optional(),
  features: z.array(z.string()).optional(),
  limits: z.record(z.unknown()).optional(),
});

const changePlanSchema = z.object({
  planId: z.string().uuid(),
});

type RouterDeps = {
  enterpriseSaasManagementService: EnterpriseSaasManagementService;
  jwtSecret: string;
  authService: import('../services/auth.service.js').AuthService;
};

function getAuth(req: import('express').Request) {
  return (req as AuthenticatedRequest).auth;
}

function staffScope(req: import('express').Request) {
  const auth = getAuth(req);
  return { companyId: auth.companyId, userId: auth.userId };
}

function getRouteParam(value: string | string[]) {
  return Array.isArray(value) ? value[0]! : value;
}

function handleError(error: unknown, res: import('express').Response) {
  if (error instanceof EnterpriseSaasManagementError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' || error.code === 'FORBIDDEN' ? 400 : 500;
    res.status(status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  throw error;
}

export function createEnterpriseSaasManagementRouter(deps: RouterDeps): Router {
  const router = Router();
  const requireStaffAuth = createAuthMiddleware({ jwtSecret: deps.jwtSecret, authService: deps.authService });
  const requireRead = requireAnyPermission(
    'saas_management:read',
    'saas_management:manage',
    'saas:read',
    'saas:manage',
    'platform:read',
    'platform:manage',
  );
  const requireWrite = requireAnyPermission('saas_management:write', 'saas_management:manage', 'saas:manage', 'platform:manage');
  const requireManage = requireAnyPermission('saas_management:manage', 'saas:manage', 'platform:manage');

  router.use(requireStaffAuth);

  router.get('/dashboard', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const dashboard = await deps.enterpriseSaasManagementService.getDashboard(auth.companyId);
      res.json({ data: { dashboard } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/owner-billing', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const ownerBilling = await deps.enterpriseSaasManagementService.getOwnerBillingSummary(auth.companyId);
      res.json({ data: { ownerBilling } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/platform-config', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const platformConfig = await deps.enterpriseSaasManagementService.getPlatformConfig(auth.companyId);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.put('/platform-config', requireManage, async (req, res) => {
    const parsed = platformConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid platform config' } });
      return;
    }
    try {
      const platformConfig = await deps.enterpriseSaasManagementService.updatePlatformConfig(staffScope(req), parsed.data);
      res.json({ data: { platformConfig } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/account-types', requireRead, async (_req, res) => {
    try {
      const accountTypes = await deps.enterpriseSaasManagementService.listAccountTypes();
      res.json({ data: { accountTypes } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/licenses', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const licenses = await deps.enterpriseSaasManagementService.listLicenses(auth.companyId);
      res.json({ data: { licenses } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/licenses', requireManage, async (req, res) => {
    const parsed = licenseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid license' } });
      return;
    }
    try {
      const license = await deps.enterpriseSaasManagementService.createLicense(staffScope(req), parsed.data);
      res.status(201).json({ data: { license } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/licenses/:licenseId/activate', requireManage, async (req, res) => {
    try {
      const license = await deps.enterpriseSaasManagementService.activateLicense(
        staffScope(req),
        getRouteParam(req.params.licenseId),
      );
      res.json({ data: { license } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/licenses/:licenseId/suspend', requireManage, async (req, res) => {
    try {
      const license = await deps.enterpriseSaasManagementService.suspendLicense(
        staffScope(req),
        getRouteParam(req.params.licenseId),
      );
      res.json({ data: { license } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/licenses/:licenseId/history', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const history = await deps.enterpriseSaasManagementService.listLicenseHistory(
        auth.companyId,
        getRouteParam(req.params.licenseId),
      );
      res.json({ data: { history } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/payment-providers', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const paymentProviders = await deps.enterpriseSaasManagementService.listPaymentProviders(auth.companyId);
      res.json({ data: { paymentProviders } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/payment-providers', requireManage, async (req, res) => {
    const parsed = paymentProviderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid payment provider' } });
      return;
    }
    try {
      const provider = await deps.enterpriseSaasManagementService.createPaymentProvider(staffScope(req), parsed.data);
      res.status(201).json({ data: { provider } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/billing-policies', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const billingPolicies = await deps.enterpriseSaasManagementService.listBillingPolicies(auth.companyId);
      res.json({ data: { billingPolicies } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/billing-policies', requireManage, async (req, res) => {
    const parsed = billingPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid billing policy' } });
      return;
    }
    try {
      const policy = await deps.enterpriseSaasManagementService.createBillingPolicy(staffScope(req), parsed.data);
      res.status(201).json({ data: { policy } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/coupons', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const coupons = await deps.enterpriseSaasManagementService.listCoupons(auth.companyId);
      res.json({ data: { coupons } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/coupons', requireManage, async (req, res) => {
    const parsed = couponSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid coupon' } });
      return;
    }
    try {
      const coupon = await deps.enterpriseSaasManagementService.createCoupon(staffScope(req), parsed.data);
      res.status(201).json({ data: { coupon } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/add-ons', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const addOns = await deps.enterpriseSaasManagementService.listAddOns(auth.companyId);
      res.json({ data: { addOns } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/add-ons', requireManage, async (req, res) => {
    const parsed = addOnSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid add-on' } });
      return;
    }
    try {
      const addOn = await deps.enterpriseSaasManagementService.createAddOn(staffScope(req), parsed.data);
      res.status(201).json({ data: { addOn } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/partners', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const partners = await deps.enterpriseSaasManagementService.listPartners(auth.companyId);
      res.json({ data: { partners } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/partners', requireManage, async (req, res) => {
    const parsed = partnerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid partner' } });
      return;
    }
    try {
      const partner = await deps.enterpriseSaasManagementService.createPartner(staffScope(req), parsed.data);
      res.status(201).json({ data: { partner } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/partner-commissions', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const commissions = await deps.enterpriseSaasManagementService.listPartnerCommissions(auth.companyId);
      res.json({ data: { commissions } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/usage-thresholds', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const usageThresholds = await deps.enterpriseSaasManagementService.listUsageThresholds(auth.companyId);
      res.json({ data: { usageThresholds } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/usage-thresholds', requireManage, async (req, res) => {
    const parsed = usageThresholdSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid usage threshold' } });
      return;
    }
    try {
      const threshold = await deps.enterpriseSaasManagementService.createUsageThreshold(staffScope(req), parsed.data);
      res.status(201).json({ data: { threshold } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/usage-monitoring', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const usageMonitoring = await deps.enterpriseSaasManagementService.getUsageMonitoring(auth.companyId);
      res.json({ data: { usageMonitoring } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/usage/capture', requireWrite, async (req, res) => {
    try {
      const targetCompanyId = typeof req.body?.targetCompanyId === 'string' ? req.body.targetCompanyId : undefined;
      const usageMonitoring = await deps.enterpriseSaasManagementService.captureUsageSnapshot(staffScope(req), targetCompanyId);
      res.json({ data: { usageMonitoring } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/feature-access-rules', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const featureAccessRules = await deps.enterpriseSaasManagementService.listFeatureAccessRules(auth.companyId);
      res.json({ data: { featureAccessRules } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/feature-access-rules', requireManage, async (req, res) => {
    const parsed = featureAccessSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid feature access rule' } });
      return;
    }
    try {
      const rule = await deps.enterpriseSaasManagementService.createFeatureAccessRule(staffScope(req), parsed.data);
      res.status(201).json({ data: { rule } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/notifications', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const notifications = await deps.enterpriseSaasManagementService.listNotifications(auth.companyId);
      res.json({ data: { notifications } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/billing-health', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const billingHealth = await deps.enterpriseSaasManagementService.getBillingHealth(auth.companyId);
      res.json({ data: { billingHealth } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/saas-alerts/sync', requireWrite, async (req, res) => {
    try {
      const alerts = await deps.enterpriseSaasManagementService.syncSaasAlerts(staffScope(req));
      res.json({ data: { saasAlerts: alerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/analytics/capture', requireWrite, async (req, res) => {
    try {
      const analytics = await deps.enterpriseSaasManagementService.captureAnalytics(staffScope(req));
      res.json({ data: { analytics } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/aura-context', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const auraContext = await deps.enterpriseSaasManagementService.buildAuraContext(auth.companyId);
      res.json({ data: { auraContext } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/saas-alerts', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const saasAlerts = await deps.enterpriseSaasManagementService.listSaasAlerts(auth.companyId);
      res.json({ data: { saasAlerts } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/saas-alerts/:alertId/acknowledge', requireWrite, async (req, res) => {
    try {
      const saasAlert = await deps.enterpriseSaasManagementService.acknowledgeSaasAlert(
        staffScope(req),
        getRouteParam(req.params.alertId),
      );
      res.json({ data: { saasAlert } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/tenants/provision', requireManage, async (req, res) => {
    const parsed = provisionTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid tenant provision request' } });
      return;
    }
    try {
      const tenant = await deps.enterpriseSaasManagementService.provisionTenant(staffScope(req), parsed.data);
      res.status(201).json({ data: { tenant } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/plans', requireManage, async (req, res) => {
    const parsed = createPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid plan' } });
      return;
    }
    try {
      const plan = await deps.enterpriseSaasManagementService.createPlan(staffScope(req), parsed.data);
      res.status(201).json({ data: { plan } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/subscriptions/upgrade', requireWrite, async (req, res) => {
    const parsed = changePlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid upgrade request' } });
      return;
    }
    try {
      const subscription = await deps.enterpriseSaasManagementService.upgradePlan(staffScope(req), parsed.data);
      res.json({ data: { subscription } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/subscriptions/downgrade', requireWrite, async (req, res) => {
    const parsed = changePlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid downgrade request' } });
      return;
    }
    try {
      const subscription = await deps.enterpriseSaasManagementService.downgradePlan(staffScope(req), parsed.data);
      res.json({ data: { subscription } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/subscriptions/cancel', requireWrite, async (req, res) => {
    try {
      const subscription = await deps.enterpriseSaasManagementService.cancelSubscription(staffScope(req));
      res.json({ data: { subscription } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.post('/action-drafts', requireWrite, async (req, res) => {
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid action draft' } });
      return;
    }
    try {
      const actionDraft = await deps.enterpriseSaasManagementService.createActionDraft(staffScope(req), parsed.data);
      res.status(201).json({ data: { actionDraft } });
    } catch (error) {
      handleError(error, res);
    }
  });

  router.get('/audit-logs', requireRead, async (req, res) => {
    try {
      const auth = getAuth(req);
      const auditLogs = await deps.enterpriseSaasManagementService.listAuditLogs(auth.companyId);
      res.json({ data: { auditLogs } });
    } catch (error) {
      handleError(error, res);
    }
  });

  return router;
}
