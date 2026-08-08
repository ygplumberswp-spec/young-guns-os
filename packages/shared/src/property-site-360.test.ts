import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PROPERTY_SITE_360_ROYAL_CAPE,
  PROPERTY_SITE_360_SECTIONS,
  assertJobSiteSnapshotImmutable,
  assertOneJobManyVisits,
  assertRoyalCapePropertyUnchanged,
  assertTechnicianDeniedPropertySite360,
  buildJobSiteSnapshotFromJob,
  buildPropertySiteAuditActions,
  canAccessPropertySite360,
  canWritePropertySite360,
  dedupePropertyActivityEvents,
  normalizePropertyAddressKey,
  paginatePropertyActivity,
  planPropertyDuplicateWarning,
  type PropertyJobSiteSnapshot,
  type PropertySiteActivityEvent,
} from './property-site-360.js';

describe('Property / Site 360 (Row 84)', () => {
  it('supports one customer owning many sites with tenant-safe address keys', () => {
    const sites = [
      {
        id: 'p1',
        customerId: PROPERTY_SITE_360_ROYAL_CAPE.canonicalCustomerId,
        key: normalizePropertyAddressKey({
          propertyName: 'Royal Cape Yacht Club',
          street: '1 Basin',
          city: 'Cape Town',
        }),
      },
      {
        id: 'p2',
        customerId: PROPERTY_SITE_360_ROYAL_CAPE.canonicalCustomerId,
        key: normalizePropertyAddressKey({
          propertyName: 'Project Site B',
          street: '2 Harbour',
          city: 'Cape Town',
        }),
      },
    ];
    assert.equal(sites.length, 2);
    assert.equal(new Set(sites.map((s) => s.customerId)).size, 1);
    assert.notEqual(sites[0]!.key, sites[1]!.key);
  });

  it('warns on possible duplicates without auto-merge', () => {
    const key = normalizePropertyAddressKey({
      propertyName: 'Royal Cape Yacht Club',
      street: '1 Basin',
      city: 'Cape Town',
    });
    const plan = planPropertyDuplicateWarning({
      incomingAddressKey: key,
      candidates: [
        { id: 'a', propertyName: 'Royal Cape Yacht Club', addressKey: key },
      ],
    });
    assert.equal(plan.decision, 'WARN_REVIEW');
    assert.equal(
      planPropertyDuplicateWarning({ incomingAddressKey: key, candidates: [] }).decision,
      'OK',
    );
  });

  it('keeps job-site snapshots immutable when property address changes', () => {
    const before: PropertyJobSiteSnapshot = buildJobSiteSnapshotFromJob({
      propertyId: PROPERTY_SITE_360_ROYAL_CAPE.propertyId,
      propertyName: 'Royal Cape Yacht Club',
      snapshotStreet: '123 Example Street',
      snapshotSuburb: null,
      snapshotCity: 'Cape Town',
      snapshotProvince: 'WC',
      snapshotPostalCode: null,
      snapshotUnit: null,
      snapshotLatitude: null,
      snapshotLongitude: null,
      snapshotFormattedAddress: '123 Example Street, Cape Town',
      snapshotSiteContactName: 'Rowan',
    });
    assert.equal(before.immutable, true);
    assert.deepEqual(
      assertJobSiteSnapshotImmutable({
        before,
        afterPropertyAddress: { street: '125 Example Street', city: 'Cape Town' },
        afterSnapshot: before,
      }),
      { immutable: true },
    );
    assert.throws(() =>
      assertJobSiteSnapshotImmutable({
        before,
        afterPropertyAddress: { street: '125 Example Street', city: 'Cape Town' },
        afterSnapshot: { ...before, street: '125 Example Street' },
      }),
    );
  });

  it('keeps multi-day visits on the same job/site', () => {
    assert.deepEqual(
      assertOneJobManyVisits({
        propertyId: PROPERTY_SITE_360_ROYAL_CAPE.propertyId,
        jobIds: [PROPERTY_SITE_360_ROYAL_CAPE.jobId],
        visitJobIds: [PROPERTY_SITE_360_ROYAL_CAPE.jobId, PROPERTY_SITE_360_ROYAL_CAPE.jobId],
      }),
      { ok: true },
    );
  });

  it('reuses Row 83 people model for site contacts (section contract)', () => {
    const keys = PROPERTY_SITE_360_SECTIONS.map((s) => s.key);
    assert.ok(keys.includes('overview'));
    assert.ok(keys.includes('equipment'));
    assert.ok(keys.includes('jobs'));
    assert.ok(keys.includes('visits'));
  });

  it('denies Technician/Client unrestricted Property 360', () => {
    assert.equal(canAccessPropertySite360({ roleName: 'Company Owner', permissions: [] }), true);
    assert.equal(
      canWritePropertySite360({ roleName: 'Manager', permissions: ['customers:write'] }),
      true,
    );
    assert.equal(
      assertTechnicianDeniedPropertySite360({
        roleName: 'Technician',
        permissions: ['customers:read'],
      }).allowed,
      false,
    );
    assert.equal(
      assertTechnicianDeniedPropertySite360({ roleName: 'Client', permissions: ['*'] }).allowed,
      false,
    );
  });

  it('protects Royal Cape / CRC / QU-0183 relationship', () => {
    assert.deepEqual(
      assertRoyalCapePropertyUnchanged({
        propertyId: PROPERTY_SITE_360_ROYAL_CAPE.propertyId,
        customerId: PROPERTY_SITE_360_ROYAL_CAPE.canonicalCustomerId,
        jobId: PROPERTY_SITE_360_ROYAL_CAPE.jobId,
        jobNumber: 'JOB-000002',
        quoteId: PROPERTY_SITE_360_ROYAL_CAPE.royalCapeQuoteId,
        quoteNumber: 'QU-0183',
        xeroQuoteId: PROPERTY_SITE_360_ROYAL_CAPE.royalCapeXeroQuoteId,
      }),
      { unchanged: true },
    );
  });

  it('dedupes and paginates activity history', () => {
    const events: PropertySiteActivityEvent[] = [
      {
        id: 'job:1',
        kind: 'job',
        occurredAt: '2026-08-01T00:00:00.000Z',
        title: 'Job',
        summary: 'a',
        href: null,
        relatedId: '1',
      },
      {
        id: 'visit:1',
        kind: 'visit',
        occurredAt: '2026-08-02T00:00:00.000Z',
        title: 'Visit',
        summary: 'b',
        href: null,
        relatedId: '1',
      },
      {
        id: 'job:1',
        kind: 'job',
        occurredAt: '2026-08-01T00:00:00.000Z',
        title: 'Job',
        summary: 'dup',
        href: null,
        relatedId: '1',
      },
    ];
    assert.equal(dedupePropertyActivityEvents(events).length, 2);
    const page = paginatePropertyActivity({
      events,
      limit: 1,
      offset: 0,
      order: 'newest',
    });
    assert.equal(page.events.length, 1);
    assert.equal(page.hasMore, true);
    assert.ok(buildPropertySiteAuditActions().includes('property_updated'));
  });
});
