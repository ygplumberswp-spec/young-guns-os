#!/usr/bin/env node
/** Thin wrapper — staging tenant isolation suite. */
process.env.STAGING_SUITE = process.env.STAGING_SUITE || 'isolation';
await import('./staging-controlled-deploy-validate.mjs');
