/** Deployment storage roots for staging/production validation. */
export const DEPLOYMENT_STORAGE_ROOT_PREFIX = '/var/lib/titan/storage/';

export type DeploymentStorageValidationInput = {
  appEnv?: string;
  titanEnv?: string;
  jobEvidenceStoragePath: string;
  companyMediaStoragePath: string;
};

export type DeploymentStorageValidationResult = {
  ok: boolean;
  deployed: boolean;
  errors: string[];
  warnings: string[];
};

function isDeployedEnvironment(appEnv?: string, titanEnv?: string): boolean {
  return (
    appEnv === 'staging' ||
    appEnv === 'production' ||
    titanEnv === 'staging' ||
    titanEnv === 'production'
  );
}

function validateSingleRoot(label: string, absolutePath: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!absolutePath.startsWith('/')) {
    errors.push(
      `${label} storage path must be absolute in staging/production (got relative path). Set JOB_EVIDENCE_STORAGE_PATH or COMPANY_MEDIA_STORAGE_PATH to a mounted volume path.`,
    );
    return { errors, warnings };
  }

  if (absolutePath.includes('/app/') || absolutePath.startsWith('/tmp/')) {
    errors.push(
      `${label} storage path must not use ephemeral container project directories (${absolutePath}). Mount a Railway volume under ${DEPLOYMENT_STORAGE_ROOT_PREFIX}.`,
    );
  }

  if (!absolutePath.startsWith(DEPLOYMENT_STORAGE_ROOT_PREFIX)) {
    warnings.push(
      `${label} storage path is outside the recommended ${DEPLOYMENT_STORAGE_ROOT_PREFIX} mount. Ensure a persistent Railway volume is attached.`,
    );
  }

  return { errors, warnings };
}

/** Refuse unsafe ephemeral storage roots in staging/production. */
export function validateDeploymentStorageConfiguration(
  input: DeploymentStorageValidationInput,
): DeploymentStorageValidationResult {
  const deployed = isDeployedEnvironment(input.appEnv, input.titanEnv);
  if (!deployed) {
    return { ok: true, deployed: false, errors: [], warnings: [] };
  }

  const job = validateSingleRoot('Job evidence / finance direct', input.jobEvidenceStoragePath);
  const media = validateSingleRoot('Company media', input.companyMediaStoragePath);
  const errors = [...job.errors, ...media.errors];
  const warnings = [...job.warnings, ...media.warnings];

  return {
    ok: errors.length === 0,
    deployed: true,
    errors,
    warnings,
  };
}

export type StorageDiagnosticInput = {
  jobEvidenceStoragePath: string;
  companyMediaStoragePath: string;
  financeDirectUsesJobEvidenceRoot: boolean;
};

/** Read-only storage diagnostic payload — never exposes raw filesystem paths to clients. */
export function buildStorageDiagnosticReport(input: StorageDiagnosticInput) {
  return {
    status: 'ok',
    jobEvidenceConfigured: Boolean(input.jobEvidenceStoragePath?.trim()),
    companyMediaConfigured: Boolean(input.companyMediaStoragePath?.trim()),
    financeDirectUsesJobEvidenceRoot: input.financeDirectUsesJobEvidenceRoot,
    recommendedVolumeMount: DEPLOYMENT_STORAGE_ROOT_PREFIX,
  };
}
