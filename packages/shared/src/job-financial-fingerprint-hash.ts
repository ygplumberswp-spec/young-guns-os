/**
 * JPE-002A / JPE-004B — Server-only SHA-256 fingerprint hashing.
 *
 * Authoritative fingerprint computation uses Node crypto. Browser bundles must
 * import from `./job-financial-fingerprint.js` (types/canonical only), not this module.
 */

import { createHash } from 'node:crypto';
import {
  buildJobFinancialFingerprintCanonical,
  buildJobFinancialFingerprintFromSources,
  type BuildFingerprintFromProfitabilitySourcesInput,
  type JobFinancialFingerprintInput,
} from './job-financial-fingerprint.js';

export function sha256HexCanonical(canonical: string): string {
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function computeJobFinancialSourceFingerprint(input: JobFinancialFingerprintInput): string {
  return sha256HexCanonical(buildJobFinancialFingerprintCanonical(input));
}

export function computeJobFinancialSourceFingerprintFromSources(
  input: BuildFingerprintFromProfitabilitySourcesInput,
): string {
  return computeJobFinancialSourceFingerprint(buildJobFinancialFingerprintFromSources(input));
}
