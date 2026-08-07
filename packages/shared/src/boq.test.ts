import test from 'node:test';
import assert from 'node:assert/strict';
import { boqMarkupPriceCents, parseBoqImportText } from './boq.js';

test('parseBoqImportText reads headered CSV preserving sequence fields', () => {
  const raw = `section,item_number,description,unit,quantity,unit_cost
General,1.1,Supply geyser,ea,2,4500.00
Plumbing,1.2,Install pipework,m,12,85.50`;

  assert.deepEqual(parseBoqImportText(raw), [
    {
      section: 'General',
      itemNumber: '1.1',
      description: 'Supply geyser',
      unit: 'ea',
      quantity: 2,
      unitCostCents: 450000,
    },
    {
      section: 'Plumbing',
      itemNumber: '1.2',
      description: 'Install pipework',
      unit: 'm',
      quantity: 12,
      unitCostCents: 8550,
    },
  ]);
});

test('parseBoqImportText accepts plain description rows without header', () => {
  assert.deepEqual(parseBoqImportText('Emergency call-out'), [
    {
      section: null,
      itemNumber: null,
      description: 'Emergency call-out',
      unit: null,
      quantity: 1,
      unitCostCents: null,
    },
  ]);
});

test('boqMarkupPriceCents applies basis-point markup', () => {
  assert.equal(boqMarkupPriceCents(10000, 2500), 12500);
});
