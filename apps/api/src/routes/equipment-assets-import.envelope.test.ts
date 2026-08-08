import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(join(here, 'equipment-assets-import.ts'), 'utf8');
const serviceSource = readFileSync(
  join(here, '../services/equipment-assets-import.service.ts'),
  'utf8',
);

describe('Row 86 equipment-assets-import envelope', () => {
  it('exposes preview/apply/search/inventory without Xero writes', () => {
    assert.match(routeSource, /\/preview/);
    assert.match(routeSource, /\/apply/);
    assert.match(routeSource, /\/search/);
    assert.match(routeSource, /\/inventory/);
    assert.match(routeSource, /xeroWrites: 0/);
    assert.match(routeSource, /row87Started: false/);
    assert.match(routeSource, /Technicians cannot open/);
    assert.match(routeSource, /Clients cannot access/);
  });

  it('service reuses canonical asset tables and blocks fabrication path', () => {
    assert.match(serviceSource, /assetEquipment/);
    assert.match(serviceSource, /alAssetRegistryProfiles/);
    assert.match(serviceSource, /MISSING_AUTHORISED|missingAuthorisedSource/);
    assert.match(serviceSource, /NO_VERIFIED_EQUIPMENT_LINKED/);
    assert.match(serviceSource, /EQUIPMENT_ASSETS_IMPORT_CRC/);
    assert.doesNotMatch(serviceSource, /xero\.|writeToXero|createXero/);
    assert.doesNotMatch(serviceSource, /rshuiaghmtrvvilhqpwm/);
  });

  it('denies technician/client on import router', () => {
    assert.match(routeSource, /role === 'Technician'/);
    assert.match(routeSource, /role === 'Client'/);
  });
});
