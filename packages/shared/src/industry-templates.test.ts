import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ITPL_COMPLIANCE_UNREVIEWED_NOTE,
  ITPL_DEFAULT_SETTINGS,
  ITPL_KNOWN_CAPABILITY_REFS,
  ITPL_LIVE_WORKFLOW_SECTIONS,
  ITPL_OPERATIONAL_SECTIONS,
  ITPL_PLUMBING_BLUEPRINT,
  ITPL_PLUMBING_CAPABILITY_REFS,
  ITPL_SECTION_KEYS,
  ITPL_TRADES,
  ITPL_TRADE_BASELINE_SUPPORT,
  buildItplBlueprint,
  buildItplCatalog,
  buildItplTradeShell,
  buildItplWithheldNotices,
  canActivateItplTemplate,
  canEditItplTemplates,
  canItplVersionActivate,
  canManageItplPlatformControls,
  canReadItplTemplates,
  filterItplDefinitionForScope,
  findItplBusinessRecordFields,
  isItplKnownCapabilityRef,
  isItplLiveWorkflowSection,
  itplChangeRequiresApproval,
  itplContainsBusinessRecords,
  itplTradeLabel,
  itplVisibleSections,
  normaliseItplDefinition,
  normaliseItplEntry,
  normaliseItplSettings,
  resolveItplChangeImpact,
  resolveItplScope,
  resolveItplSectionSupport,
  resolveItplTemplateSupport,
  type ItplSectionEntry,
  type ItplTemplateDefinition,
} from './industry-templates.js';

describe('industry template trades', () => {
  it('treats plumbing as the live configuration and every other trade as a shell', () => {
    assert.equal(ITPL_TRADE_BASELINE_SUPPORT.plumbing, 'supported');
    for (const trade of ITPL_TRADES) {
      if (trade === 'plumbing') continue;
      assert.equal(
        ITPL_TRADE_BASELINE_SUPPORT[trade],
        'requires_configuration',
        `${trade} must not claim to be supported`,
      );
    }
  });

  it('names a custom trade honestly', () => {
    assert.equal(itplTradeLabel('plumbing'), 'Plumbing');
    assert.equal(itplTradeLabel('other_trade', 'Solar Installation'), 'Solar Installation');
    assert.equal(itplTradeLabel('other_trade', '   '), 'Another trade');
    assert.equal(itplTradeLabel('other_trade', null), 'Another trade');
  });

  it('describes the catalog without overstating an unconfigured trade', () => {
    const catalog = buildItplCatalog();
    assert.equal(catalog.length, ITPL_TRADES.length);
    const plumbing = catalog.find((item) => item.trade === 'plumbing');
    assert.equal(plumbing?.support, 'supported');
    for (const item of catalog) {
      if (item.trade === 'plumbing') continue;
      assert.equal(item.support, 'requires_configuration');
      assert.match(item.guidance, /compliance/i);
    }
  });
});

describe('industry template plumbing blueprint', () => {
  it('covers every configurable section', () => {
    const sections = ITPL_PLUMBING_BLUEPRINT.sections.map((section) => section.section);
    for (const key of ITPL_SECTION_KEYS) {
      assert.ok(sections.includes(key), `plumbing blueprint is missing ${key}`);
    }
  });

  it('only ever points at capabilities that already exist', () => {
    for (const section of ITPL_PLUMBING_BLUEPRINT.sections) {
      for (const item of section.entries) {
        assert.ok(
          isItplKnownCapabilityRef(item.capabilityRef),
          `${section.section}/${item.key} references an unknown capability`,
        );
      }
    }
  });

  it('references the plumbing capabilities the business already runs on', () => {
    const referenced = new Set(
      ITPL_PLUMBING_BLUEPRINT.sections.flatMap((section) =>
        section.entries.map((item) => item.capabilityRef).filter(Boolean),
      ),
    );
    for (const ref of ['jobs', 'job_cards', 'quotes', 'documents', 'recurring_maintenance']) {
      assert.ok(referenced.has(ref), `plumbing template should configure ${ref}`);
    }
    for (const ref of ITPL_PLUMBING_CAPABILITY_REFS) {
      assert.ok(ITPL_KNOWN_CAPABILITY_REFS.includes(ref), `${ref} must be a real capability`);
    }
  });

  it('keeps the plumbing job types the business actually runs', () => {
    const jobTypes = ITPL_PLUMBING_BLUEPRINT.sections.find(
      (section) => section.section === 'job_types',
    );
    const keys = jobTypes?.entries.map((item) => item.key) ?? [];
    for (const expected of ['geyser', 'drains', 'leaks', 'bathroom_renovation']) {
      assert.ok(keys.includes(expected), `plumbing must keep the ${expected} job type`);
    }
  });

  it('carries no business records', () => {
    assert.equal(itplContainsBusinessRecords(ITPL_PLUMBING_BLUEPRINT), false);
    assert.deepEqual(findItplBusinessRecordFields(ITPL_PLUMBING_BLUEPRINT), []);
  });

  it('survives normalisation without being downgraded', () => {
    const normalised = normaliseItplDefinition(ITPL_PLUMBING_BLUEPRINT);
    assert.equal(resolveItplTemplateSupport(normalised), 'supported');
  });

  it('returns a shell for a trade that has not been configured', () => {
    for (const trade of ITPL_TRADES) {
      if (trade === 'plumbing') continue;
      const shell = buildItplBlueprint(trade);
      assert.equal(shell.trade, trade);
      assert.ok(shell.sections.every((section) => section.entries.length === 0));
      const compliance = shell.sections.find(
        (section) => section.section === 'compliance_requirements',
      );
      assert.equal(compliance?.support, 'requires_compliance_review');
      assert.notEqual(resolveItplTemplateSupport(shell), 'supported');
    }
  });

  it('builds a shell covering every section', () => {
    const shell = buildItplTradeShell('electrical');
    assert.equal(shell.sections.length, ITPL_SECTION_KEYS.length);
  });
});

describe('industry template configure-not-duplicate guard', () => {
  it('rejects a reference to a capability the platform does not have', () => {
    assert.equal(isItplKnownCapabilityRef('jobs'), true);
    assert.equal(isItplKnownCapabilityRef(null), true);
    assert.equal(isItplKnownCapabilityRef('bespoke_hvac_engine'), false);

    const normalised = normaliseItplEntry(
      {
        key: 'x',
        label: 'Custom engine',
        capabilityRef: 'bespoke_hvac_engine',
        support: 'supported',
        notes: null,
      },
      'job_types',
    );
    assert.equal(normalised.capabilityRef, null);
    assert.equal(normalised.support, 'requires_configuration');
    assert.match(String(normalised.notes), /does not exist in TITAN/);
  });

  it('finds business record fields hidden anywhere in a definition', () => {
    const smuggled = {
      sections: [{ entries: [{ key: 'a', customerName: 'someone', invoiceNumber: 'INV-1' }] }],
    };
    const found = findItplBusinessRecordFields(smuggled);
    assert.ok(found.includes('customerName'));
    assert.ok(found.includes('invoiceNumber'));
    assert.equal(itplContainsBusinessRecords(smuggled), true);
  });

  it('does not flag ordinary configuration fields', () => {
    assert.equal(
      itplContainsBusinessRecords({ key: 'geyser', label: 'Geyser', support: 'supported' }),
      false,
    );
  });

  it('stops scanning before it can run away on a deep structure', () => {
    let deep: Record<string, unknown> = { customerId: 'leaf' };
    for (let i = 0; i < 40; i += 1) deep = { child: deep };
    assert.deepEqual(findItplBusinessRecordFields(deep), []);
  });
});

describe('industry template compliance honesty', () => {
  it('downgrades and labels an unreviewed compliance requirement', () => {
    const normalised = normaliseItplEntry(
      {
        key: 'sans_xyz',
        label: 'Some standard applies',
        capabilityRef: 'compliance',
        support: 'supported',
        notes: 'This standard is mandatory.',
      },
      'compliance_requirements',
    );
    assert.equal(normalised.support, 'requires_compliance_review');
    assert.equal(normalised.notes, ITPL_COMPLIANCE_UNREVIEWED_NOTE);
    assert.equal(normalised.compliance?.reviewed, false);
    assert.match(String(normalised.notes), /does not assert/i);
  });

  it('keeps a reviewed requirement as stated', () => {
    const normalised = normaliseItplEntry(
      {
        key: 'coc_gas',
        label: 'COC for gas work',
        capabilityRef: 'compliance',
        support: 'supported',
        notes: 'Recorded in the existing configuration.',
        compliance: {
          reviewed: true,
          authority: 'Young Guns Plumbing COC configuration',
          reference: 'ref',
          reviewedAt: null,
        },
      },
      'compliance_requirements',
    );
    assert.equal(normalised.support, 'supported');
    assert.equal(normalised.compliance?.reviewed, true);
  });

  it('never lets settings turn unreviewed claims on', () => {
    const settings = normaliseItplSettings({
      allowUnreviewedComplianceClaims: true as unknown as false,
      seedTenantRecords: true as unknown as false,
      requireApprovalForLiveChanges: false as unknown as true,
    });
    assert.equal(settings.allowUnreviewedComplianceClaims, false);
    assert.equal(settings.seedTenantRecords, false);
    assert.equal(settings.requireApprovalForLiveChanges, true);
    assert.equal(ITPL_DEFAULT_SETTINGS.seedTenantRecords, false);
    assert.deepEqual(normaliseItplSettings(null), ITPL_DEFAULT_SETTINGS);
  });
});

describe('industry template support roll-up', () => {
  function entry(support: ItplSectionEntry['support']): ItplSectionEntry {
    return { key: 'k', label: 'l', capabilityRef: null, support, notes: null };
  }

  it('is only as strong as the weakest entry', () => {
    assert.equal(resolveItplSectionSupport([entry('supported'), entry('supported')]), 'supported');
    assert.equal(
      resolveItplSectionSupport([entry('supported'), entry('requires_configuration')]),
      'requires_configuration',
    );
    assert.equal(
      resolveItplSectionSupport([entry('requires_configuration'), entry('unavailable')]),
      'unavailable',
    );
    assert.equal(
      resolveItplSectionSupport([entry('supported'), entry('requires_compliance_review')]),
      'requires_compliance_review',
    );
  });

  it('treats an empty section as needing configuration', () => {
    assert.equal(resolveItplSectionSupport([]), 'requires_configuration');
    assert.equal(
      resolveItplTemplateSupport({ trade: 'hvac', tradeLabel: 'HVAC', sections: [] }),
      'requires_configuration',
    );
  });
});

describe('industry template versioning', () => {
  const base: ItplTemplateDefinition = buildItplBlueprint('plumbing');

  it('treats a first version as touching the live workflow', () => {
    assert.equal(resolveItplChangeImpact(null, base), 'live_workflow');
    assert.ok(itplChangeRequiresApproval('live_workflow'));
    assert.equal(itplChangeRequiresApproval('presentation_only'), false);
  });

  it('flags a change to a live workflow section', () => {
    const next: ItplTemplateDefinition = {
      ...base,
      sections: base.sections.map((section) =>
        section.section === 'job_types'
          ? {
              ...section,
              entries: [
                ...section.entries,
                {
                  key: 'new_type',
                  label: 'New job type',
                  capabilityRef: 'jobs',
                  support: 'supported',
                  notes: null,
                },
              ],
            }
          : section,
      ),
    };
    assert.equal(resolveItplChangeImpact(base, next), 'live_workflow');
  });

  it('treats a terminology-only change as presentation', () => {
    const next: ItplTemplateDefinition = {
      ...base,
      sections: base.sections.map((section) =>
        section.section === 'terminology'
          ? {
              ...section,
              entries: [
                {
                  key: 'technician',
                  label: 'Artisan',
                  capabilityRef: null,
                  support: 'supported',
                  notes: null,
                },
              ],
            }
          : section,
      ),
    };
    assert.equal(resolveItplChangeImpact(base, next), 'presentation_only');
  });

  it('reports no change when nothing moved', () => {
    assert.equal(resolveItplChangeImpact(base, base), 'presentation_only');
  });

  it('only lets an approved version go live', () => {
    assert.ok(canItplVersionActivate('approved'));
    for (const status of ['draft', 'pending_approval', 'rejected'] as const) {
      assert.equal(canItplVersionActivate(status), false, `${status} must not activate`);
    }
  });

  it('classifies which sections affect live work', () => {
    assert.ok(isItplLiveWorkflowSection('compliance_requirements'));
    assert.ok(isItplLiveWorkflowSection('job_types'));
    assert.equal(isItplLiveWorkflowSection('terminology'), false);
    assert.ok(ITPL_LIVE_WORKFLOW_SECTIONS.length >= 6);
  });
});

describe('industry template access', () => {
  it('gives the owner everything', () => {
    const identity = { roleName: 'owner', permissions: [], userId: 'u1' };
    assert.equal(resolveItplScope(identity), 'owner_full');
    assert.ok(canReadItplTemplates(identity));
    assert.ok(canEditItplTemplates(identity));
    assert.ok(canActivateItplTemplate(identity));
    assert.deepEqual(itplVisibleSections('owner_full'), ITPL_SECTION_KEYS);
  });

  it('denies clients even with a wildcard permission', () => {
    for (const roleName of ['client', 'customer', 'portal_user', 'client_admin']) {
      const identity = { roleName, permissions: ['*'], userId: 'u2' };
      assert.equal(resolveItplScope(identity), 'denied', `${roleName} must be denied`);
      assert.equal(canReadItplTemplates(identity), false);
      assert.equal(canEditItplTemplates(identity), false);
    }
  });

  it('lets technicians read operational sections but never edit architecture', () => {
    for (const roleName of ['technician', 'senior_technician', 'apprentice', 'driver']) {
      const identity = { roleName, permissions: ['*'], userId: 'u3' };
      assert.equal(resolveItplScope(identity), 'staff_read', `${roleName} should be read only`);
      assert.ok(canReadItplTemplates(identity));
      assert.equal(canEditItplTemplates(identity), false, `${roleName} must not edit`);
      assert.equal(canActivateItplTemplate(identity), false);
    }
    assert.deepEqual(itplVisibleSections('staff_read'), ITPL_OPERATIONAL_SECTIONS);
  });

  it('never shows a technician the approval or compliance architecture', () => {
    const visible = itplVisibleSections('staff_read');
    for (const hidden of ['approval_requirements', 'compliance_requirements', 'trade_workflows']) {
      assert.ok(!visible.includes(hidden as never), `${hidden} must stay hidden`);
    }
  });

  it('lets an admin manage drafts but not activate', () => {
    const identity = { roleName: 'admin', permissions: ['company:manage'], userId: 'u4' };
    assert.equal(resolveItplScope(identity), 'admin_manage');
    assert.ok(canEditItplTemplates(identity));
    assert.equal(canActivateItplTemplate(identity), false, 'only the Owner activates');
  });

  it('drops an admin without the permission back to read only', () => {
    assert.equal(
      resolveItplScope({ roleName: 'admin', permissions: ['jobs:read'], userId: 'u5' }),
      'staff_read',
    );
  });

  it('denies an empty role', () => {
    assert.equal(resolveItplScope({ roleName: null, permissions: ['*'] }), 'denied');
    assert.equal(resolveItplScope({ roleName: '  ', permissions: ['*'] }), 'denied');
  });

  it('keeps platform trade controls with the platform owner', () => {
    assert.ok(canManageItplPlatformControls({ roleName: 'platform_owner' }));
    assert.equal(canManageItplPlatformControls({ roleName: 'owner' }), false);
    assert.equal(canManageItplPlatformControls({ roleName: 'admin', permissions: ['*'] }), false);
  });

  it('trims a definition to what a scope may see and says what was held back', () => {
    const definition = buildItplBlueprint('plumbing');
    const trimmed = filterItplDefinitionForScope(definition, 'staff_read');
    assert.ok(trimmed.sections.length < definition.sections.length);
    for (const section of trimmed.sections) {
      assert.ok(ITPL_OPERATIONAL_SECTIONS.includes(section.section));
    }

    const notices = buildItplWithheldNotices('staff_read');
    assert.ok(notices.length > 0);
    assert.ok(notices.every((notice) => notice.reason.length > 0));
    assert.ok(notices.some((notice) => notice.section === 'approval_requirements'));

    const ownerView = filterItplDefinitionForScope(definition, 'owner_full');
    assert.equal(ownerView.sections.length, definition.sections.length);
    assert.deepEqual(buildItplWithheldNotices('owner_full'), []);
  });
});
