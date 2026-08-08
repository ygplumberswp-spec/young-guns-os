import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'property-site-360.ts'), 'utf8');
const serviceSource = readFileSync(join(here, '../services/property-site-360.service.ts'), 'utf8');

describe('Property Site 360 route envelope', () => {
  it('mounts technician/client denial and immutable snapshot flags', () => {
    assert.match(routeSource, /Technician/);
    assert.match(routeSource, /Client/);
    assert.match(routeSource, /jobSnapshotsImmutable: true/);
    assert.match(routeSource, /row85: false/);
    assert.match(routeSource, /row86: false/);
    assert.match(routeSource, /xeroWrites: false/);
  });

  it('reuses canonical tables — no parallel property/equipment systems', () => {
    assert.match(serviceSource, /cxCustomerProperties/);
    assert.match(serviceSource, /customerPeople/);
    assert.match(serviceSource, /alAssetRegistryProfiles/);
    assert.match(serviceSource, /assetEquipment/);
    assert.doesNotMatch(serviceSource, /createParallelPropert/);
    assert.match(serviceSource, /hardDeleteBlocked/);
    assert.match(serviceSource, /SNAPSHOT_MUTATION|snapshotStreet/);
  });
});
