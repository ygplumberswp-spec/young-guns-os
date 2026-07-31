#!/usr/bin/env node
/** Thin wrapper — staging core workflow smoke suite. */
process.env.STAGING_SUITE = process.env.STAGING_SUITE || 'smoke';
await import('./staging-controlled-deploy-validate.mjs');
