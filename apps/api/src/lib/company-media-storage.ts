import {
  LOCAL_COMPANY_MEDIA_STORAGE_PATH,
  PRODUCTION_COMPANY_MEDIA_STORAGE_PATH,
  repoRoot,
  resolveStoragePath,
} from './storage-paths.js';

export { repoRoot };

export function resolveCompanyMediaStoragePath(configuredPath?: string | null): string {
  return resolveStoragePath({
    configuredPath,
    localRelativeDefault: LOCAL_COMPANY_MEDIA_STORAGE_PATH,
    productionAbsoluteDefault: PRODUCTION_COMPANY_MEDIA_STORAGE_PATH,
    label: 'company-media',
  });
}
