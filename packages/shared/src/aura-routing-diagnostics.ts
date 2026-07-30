export type ProviderRoutingStageTimings = {
  allowanceCheckMs: number;
  resilienceConfigMs: number;
  tenantSnapshotMs: number;
  providerChainBuildMs: number;
  providerRankingMs: number;
  environmentProviderMs: number;
  permissionValidationMs: number;
  policyValidationMs: number;
  usageAllowanceLookupMs: number;
  tenantProviderLookupMs: number;
  routingRuleLookupMs: number;
  fallbackConfigLookupMs: number;
  modelLookupMs: number;
  providerHealthLookupMs: number;
  providerRankingOnlyMs: number;
  encryptionMs: number;
};

export type ProviderRoutingDiagnostics = {
  totalRoutingMs: number;
  cacheHit: boolean;
  fastPathUsed: boolean;
  dbQueryCount: number;
  providerAttemptsPlanned: number;
  stages: ProviderRoutingStageTimings;
};
