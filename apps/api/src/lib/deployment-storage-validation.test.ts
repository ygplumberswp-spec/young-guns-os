import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEPLOYMENT_STORAGE_ROOT_PREFIX,
  validateDeploymentStorageConfiguration,
} from './deployment-storage-validation.js';

describe('validateDeploymentStorageConfiguration', () => {
  it('allows local relative paths in development', () => {
    const result = validateDeploymentStorageConfiguration({
      appEnv: 'development',
      titanEnv: 'development',
      jobEvidenceStoragePath: '/workspace/storage/job-evidence',
      companyMediaStoragePath: '/workspace/storage/company-media',
    });
    assert.equal(result.ok, true);
    assert.equal(result.deployed, false);
  });

  it('rejects ephemeral /app paths in staging', () => {
    const result = validateDeploymentStorageConfiguration({
      appEnv: 'staging',
      titanEnv: 'staging',
      jobEvidenceStoragePath: '/app/storage/job-evidence',
      companyMediaStoragePath: `${DEPLOYMENT_STORAGE_ROOT_PREFIX}company-media`,
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /ephemeral container project directories/i);
  });

  it('accepts recommended volume mount paths in production', () => {
    const result = validateDeploymentStorageConfiguration({
      appEnv: 'production',
      titanEnv: 'production',
      jobEvidenceStoragePath: `${DEPLOYMENT_STORAGE_ROOT_PREFIX}job-evidence`,
      companyMediaStoragePath: `${DEPLOYMENT_STORAGE_ROOT_PREFIX}company-media`,
    });
    assert.equal(result.ok, true);
    assert.equal(result.errors.length, 0);
  });
});
