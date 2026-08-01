import type { DraftRecordType, DraftWorkspaceSummary } from '@titan/shared';
import { fetchDrafts } from '../../lib/drafts-api';
import { useStaffCachedQuery } from '../../lib/use-scoped-cached-query';

type UseFinanceSectionDraftsOptions = {
  accessToken: string | null;
  recordType: Extract<DraftRecordType, 'quote' | 'invoice'>;
  enabled: boolean;
  includeArchived?: boolean;
};

export function useFinanceSectionDrafts({
  accessToken,
  recordType,
  enabled,
  includeArchived = false,
}: UseFinanceSectionDraftsOptions): {
  drafts: DraftWorkspaceSummary[];
  isLoading: boolean;
  error: string | null;
} {
  const status = includeArchived ? 'archived' : 'active';
  const { data, error, isLoading } = useStaffCachedQuery({
    queryKey: `finance/section-drafts:${recordType}:${status}`,
    enabled: enabled && Boolean(accessToken),
    fetcher: async () => fetchDrafts(accessToken!, { recordType, status }),
  });

  return {
    drafts: data ?? [],
    isLoading,
    error,
  };
}
