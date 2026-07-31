#!/usr/bin/env node
/** Thin wrapper — staging RBAC suite (includes auth + runtime). */
process.env.STAGING_SUITE = process.env.STAGING_SUITE || 'rbac';
await import('./staging-controlled-deploy-validate.mjs');
