import type { Router } from 'express';
import type { DatabaseClient } from '@titan/db';
import { createDenyTechnicianFromOwnerModules } from './authorization-guards.js';

/** Block technicians from owner/admin API modules after authentication. */
export function applyStaffOwnerGuards(router: Router, db: DatabaseClient): void {
  router.use(createDenyTechnicianFromOwnerModules(db));
}
