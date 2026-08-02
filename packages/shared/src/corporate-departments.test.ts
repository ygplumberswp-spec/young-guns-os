import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CORPORATE_DEPARTMENTS,
  EXPECTED_CORPORATE_DEPARTMENT_COUNT,
  getCorporateDepartmentById,
  mapActionQueueItemToDepartments,
} from './corporate-departments.js';

describe('corporate-departments', () => {
  it('defines exactly 19 departments', () => {
    assert.equal(CORPORATE_DEPARTMENTS.length, EXPECTED_CORPORATE_DEPARTMENT_COUNT);
    const ids = new Set(CORPORATE_DEPARTMENTS.map((dept) => dept.id));
    assert.equal(ids.size, EXPECTED_CORPORATE_DEPARTMENT_COUNT);
  });

  it('maps overdue invoices to finance', () => {
    const departments = mapActionQueueItemToDepartments({
      id: 'overdue-invoices',
      category: 'Finance',
      title: 'Overdue invoices',
      description: 'Test',
      count: 2,
      href: '/finance/invoices',
      priority: 'high',
    });
    assert.ok(departments.includes('finance_accounting'));
  });

  it('resolves department by id', () => {
    const dept = getCorporateDepartmentById('hr_workforce');
    assert.ok(dept);
    assert.equal(dept?.label, 'HR & Workforce');
    assert.ok(dept?.manageRoutes.includes('/workforce/owner'));
  });
});
