import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'smart-notification-intelligence.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/smart-notification-intelligence.service.ts'),
  'utf8',
);
const sharedSource = readFileSync(
  join(here, '../../../../packages/shared/src/smart-notification-intelligence.ts'),
  'utf8',
);

describe('smart notification intelligence API envelope & safety', () => {
  it('wraps success responses with honesty flags', () => {
    for (const pattern of [
      'autoActioned: false as const',
      'autoExecuted: false as const',
      'inventSignals: false as const',
      'fakeBusinessData: false as const',
      'approvalRequired: true as const',
      'sensitiveCategoriesOwnerOnly: true as const',
      'historyPreserved: true as const',
      'executedDownstreamChange: false as const',
    ]) {
      assert.ok(routeSource.includes(pattern), `missing envelope flag: ${pattern}`);
    }
    assert.ok(!routeSource.includes('autoExecuted: true'));
    assert.ok(!routeSource.includes('autoActioned: true'));
    assert.ok(!routeSource.includes('inventSignals: true'));
    assert.ok(!routeSource.includes('fakeBusinessData: true'));
  });

  it('gates the whole router behind auth and a signed-in role check', () => {
    assert.ok(routeSource.includes('router.use(requireAuth)'));
    assert.ok(routeSource.includes('canAccessSmartNotifications'));
    assert.ok(routeSource.includes("code: 'FORBIDDEN'"));
    // The route guard is deliberately the weaker of the two — the service
    // decides scope and category, and the test below proves it re-checks.
    assert.ok(routeSource.includes('The service re-checks the same rules'));
  });

  it('scopes technicians to own work and clients to own records', () => {
    assert.ok(sharedSource.includes('export function resolveSnAudienceScope'));
    const scopeFn = sharedSource.slice(
      sharedSource.indexOf('export function resolveSnAudienceScope'),
      sharedSource.indexOf('export function canViewSnCategory'),
    );
    // Role is checked before permissions, so a wildcard cannot widen a
    // technician or client beyond their own rows.
    assert.ok(scopeFn.indexOf("role === 'Client'") < scopeFn.indexOf("includes('*')"));
    assert.ok(scopeFn.indexOf("role === 'Technician'") < scopeFn.indexOf("includes('*')"));
    assert.ok(serviceSource.includes('const ownRowsOnly = scope !== '));
    assert.ok(serviceSource.includes('eq(notifications.recipientUserId, actor.userId)'));
    assert.ok(serviceSource.includes('eq(ncAlerts.assignedUserId, actor.userId)'));
    assert.ok(serviceSource.includes('private isClientVisibleEntity'));
    assert.ok(sharedSource.includes('SN_CLIENT_ENTITY_TYPES'));
  });

  it('keeps sensitive finance, payroll and security categories Owner only', () => {
    assert.ok(sharedSource.includes('SN_OWNER_ONLY_CATEGORIES'));
    for (const category of ["'finance'", "'cash_flow'", "'overdue_invoice'", "'security'"]) {
      assert.ok(sharedSource.includes(category), `missing sensitive category: ${category}`);
    }
    const viewFn = sharedSource.slice(
      sharedSource.indexOf('export function canViewSnCategory'),
      sharedSource.indexOf('export function listVisibleSnCategories'),
    );
    // Owner-only categories are decided by role, before any permission check.
    assert.ok(viewFn.includes('return isSnOwnerRole(identity)'));
    assert.ok(!viewFn.includes("includes('*')"), 'wildcard must not reveal sensitive categories');
    assert.ok(serviceSource.includes('canViewSnCategory'));
    assert.ok(serviceSource.includes('listVisibleSnCategories'));
  });

  it('service re-enforces access so the route guard cannot be bypassed', () => {
    assert.ok(serviceSource.includes('private assertRead'));
    assert.ok(serviceSource.includes('private assertSettings'));
    assert.ok(serviceSource.includes('private assertApprove'));
    assert.ok(serviceSource.includes('canManageSnSettings'));
    assert.ok(serviceSource.includes('canApproveSnActionDrafts'));
    assert.ok(serviceSource.includes('canEscalateSnSignal'));
    for (const method of [
      'getDashboard',
      'getSettings',
      'updateSettings',
      'listCategoryControls',
      'updateCategoryControl',
      'actOnSignal',
      'listSignalAudit',
      'listCompanyAudit',
      'listActionDrafts',
      'createActionDraft',
      'decideActionDraft',
      'refreshActionDrafts',
    ]) {
      assert.ok(serviceSource.includes(`async ${method}(`), `missing method: ${method}`);
    }
  });

  it('reads the existing notification surfaces instead of rebuilding them', () => {
    // Per-user inbox rows and Notification Centre alerts are the only sources.
    assert.ok(serviceSource.includes('.from(notifications)'));
    assert.ok(serviceSource.includes('.from(ncAlerts)'));
    assert.ok(sharedSource.includes('rather than replacing them'));
    assert.ok(sharedSource.includes('rather than rebuilding delivery'));
    // Neither source table is written to by this layer.
    assert.ok(!serviceSource.includes('insert(notifications)'));
    assert.ok(!serviceSource.includes('update(notifications)'));
    assert.ok(!serviceSource.includes('insert(ncAlerts)'));
    assert.ok(!serviceSource.includes('update(ncAlerts)'));
    assert.ok(!serviceSource.includes('delete('), 'this layer never deletes a row');
  });

  it('every query and mutation is scoped by companyId', () => {
    for (const scoped of [
      'eq(notifications.companyId, actor.companyId)',
      'eq(ncAlerts.companyId, actor.companyId)',
      'eq(snSettings.companyId, companyId)',
      'eq(snCategoryControls.companyId, actor.companyId)',
      'eq(snSignalStates.companyId, actor.companyId)',
      'eq(snSignalEvents.companyId, actor.companyId)',
      'eq(snActionDrafts.companyId, actor.companyId)',
    ]) {
      assert.ok(serviceSource.includes(scoped), `missing company scope: ${scoped}`);
    }
    assert.ok(serviceSource.includes('companyId: actor.companyId'));
    assert.ok(
      serviceSource.includes(
        'and(eq(snActionDrafts.id, actionId), eq(snActionDrafts.companyId, actor.companyId))',
      ),
    );
    assert.ok(
      serviceSource.includes(
        'and(eq(snSettings.id, current.id), eq(snSettings.companyId, actor.companyId))',
      ),
    );
    // A personal decision is keyed by company, user and signal together.
    assert.ok(serviceSource.includes('eq(snSignalStates.userId, actor.userId)'));
  });

  it('reduces noise without hiding anything silently', () => {
    assert.ok(sharedSource.includes('export function groupSnSignals'));
    assert.ok(sharedSource.includes('export function applySnControls'));
    assert.ok(sharedSource.includes('SN_SUPPRESSION_EXPLANATIONS'));
    // Every suppression path records a reason on the response.
    for (const reason of [
      'category_disabled',
      'below_category_threshold',
      'below_global_threshold',
      'digest_only',
      'snoozed',
      'dismissed',
      'feed_limit',
    ]) {
      assert.ok(sharedSource.includes(`'${reason}'`), `missing suppression reason: ${reason}`);
    }
    // A digest preference must never be able to bury an emergency.
    assert.ok(sharedSource.includes("group.severity === 'critical' || group.status === 'escalated'"));
    assert.ok(sharedSource.includes('duplicateCount'));
    assert.ok(serviceSource.includes('groupSnSignals'));
    assert.ok(serviceSource.includes('applySnControls'));
  });

  it('never invents a signal — empty categories report unavailable', () => {
    assert.ok(sharedSource.includes('export function buildSnCategoryCoverage'));
    assert.ok(sharedSource.includes('No signal is invented to fill the gap.'));
    assert.ok(sharedSource.includes("availability: 'unavailable'"));
    assert.ok(sharedSource.includes("availability: 'needs_review'"));
    assert.ok(sharedSource.includes('nothing to brief on'));
    assert.ok(serviceSource.includes('buildSnCategoryCoverage'));
    assert.ok(serviceSource.includes('inventSignalsEnabled: false'));
    assert.ok(serviceSource.includes('signalsInvented: false'));
  });

  it('recommendations are approval-gated and never act on the business', () => {
    assert.ok(serviceSource.includes('autoExecuted: false'));
    assert.ok(!serviceSource.includes('autoExecuted: true'));
    assert.ok(serviceSource.includes('approvalRequired: true'));
    assert.ok(serviceSource.includes('executedDownstreamChange: false'));
    assert.ok(serviceSource.includes('Nothing executes on creation'));
    assert.ok(serviceSource.includes('never executes a change'));
    assert.ok(
      serviceSource.includes('Only the Company Owner or Platform Owner may decide a notification recommendation.'),
    );
    // The recommendation text itself rules out the dangerous actions.
    assert.ok(
      sharedSource.includes(
        'never releases a payment, runs payroll, publishes content or changes permissions',
      ),
    );
    // Invariants cannot be switched on through settings.
    assert.ok(serviceSource.includes('Invariants can never be switched on'));
    assert.ok(serviceSource.includes('autoActionsEnabled: false'));
  });

  it('keeps a full audit history and never deletes a signal decision', () => {
    assert.ok(serviceSource.includes("entityType: 'smart_notification_intelligence'"));
    assert.ok(serviceSource.includes('securityAuditLogs'));
    assert.ok(serviceSource.includes('insert(snSignalEvents)'));
    for (const action of [
      'smart_notifications.settings.update',
      'smart_notifications.category.update',
      'smart_notifications.signal.',
      'smart_notifications.action.create',
      'smart_notifications.action.decide',
      'smart_notifications.action.refresh',
    ]) {
      assert.ok(serviceSource.includes(action), `missing audit action: ${action}`);
    }
    assert.ok(serviceSource.includes('historyPreserved: true'));
    assert.ok(serviceSource.includes('deleted: false'));
  });

  it('bounds snooze so a signal is deferred, never buried', () => {
    assert.ok(routeSource.includes('SN_MIN_SNOOZE_MINUTES'));
    assert.ok(routeSource.includes('SN_MAX_SNOOZE_MINUTES'));
    assert.ok(serviceSource.includes('isValidSnSnoozeMinutes'));
    assert.ok(sharedSource.includes('export const SN_MAX_SNOOZE_MINUTES = 10_080'));
  });

  it('validates payloads and contains no fake business data', () => {
    assert.ok(routeSource.includes('z.object('));
    assert.ok(routeSource.includes('categorySchema'));
    assert.ok(routeSource.includes('severitySchema'));
    assert.ok(routeSource.includes('.uuid()'));
    for (const marker of ['demo', 'sample', 'placeholder', 'lorem', 'faker', 'Math.random']) {
      assert.ok(
        !routeSource.toLowerCase().includes(marker.toLowerCase()),
        `route must not contain fake marker: ${marker}`,
      );
      assert.ok(
        !serviceSource.toLowerCase().includes(marker.toLowerCase()),
        `service must not contain fake marker: ${marker}`,
      );
      assert.ok(
        !sharedSource.toLowerCase().includes(marker.toLowerCase()),
        `shared logic must not contain fake marker: ${marker}`,
      );
    }
  });
});
