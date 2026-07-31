import type { AiCapabilityFlag, AiRoutingCategory } from '@titan/shared';

export type RankableProvider = {
  providerKey: string;
  modelKey: string;
  providerId: string | null;
  displayName: string;
  contextWindow: number;
  capabilities: AiCapabilityFlag[];
  multimodal: boolean;
  averageLatencyMs: number | null;
  priorityWeight: number;
  inputCostPer1kTokensCents: number;
};

const CATEGORY_REQUIREMENTS: Record<
  AiRoutingCategory,
  {
    requiredCapabilities: AiCapabilityFlag[];
    preferLowLatency: boolean;
    preferLongContext: boolean;
  }
> = {
  reasoning: {
    requiredCapabilities: ['reasoning'],
    preferLowLatency: false,
    preferLongContext: false,
  },
  coding: {
    requiredCapabilities: ['function_calling'],
    preferLowLatency: false,
    preferLongContext: false,
  },
  business_analysis: {
    requiredCapabilities: [],
    preferLowLatency: false,
    preferLongContext: false,
  },
  finance: {
    requiredCapabilities: ['structured_output'],
    preferLowLatency: false,
    preferLongContext: false,
  },
  legal: {
    requiredCapabilities: ['max_context'],
    preferLowLatency: false,
    preferLongContext: true,
  },
  marketing: { requiredCapabilities: [], preferLowLatency: true, preferLongContext: false },
  image_understanding: {
    requiredCapabilities: ['vision', 'multimodal'],
    preferLowLatency: false,
    preferLongContext: false,
  },
  document_analysis: {
    requiredCapabilities: ['max_context'],
    preferLowLatency: false,
    preferLongContext: true,
  },
  long_context_analysis: {
    requiredCapabilities: ['max_context'],
    preferLowLatency: false,
    preferLongContext: true,
  },
  speech: { requiredCapabilities: ['speech'], preferLowLatency: true, preferLongContext: false },
  translation: { requiredCapabilities: [], preferLowLatency: true, preferLongContext: false },
  summarization: { requiredCapabilities: [], preferLowLatency: true, preferLongContext: false },
};

export class AiIntelligentRoutingService {
  rankProviders(
    providers: RankableProvider[],
    routingCategory?: AiRoutingCategory,
  ): RankableProvider[] {
    if (!routingCategory) {
      return [...providers].sort((left, right) => right.priorityWeight - left.priorityWeight);
    }

    const requirements = CATEGORY_REQUIREMENTS[routingCategory];

    return [...providers].sort((left, right) => {
      const leftScore = scoreProvider(left, requirements);
      const rightScore = scoreProvider(right, requirements);
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
      return right.priorityWeight - left.priorityWeight;
    });
  }
}

function scoreProvider(
  provider: RankableProvider,
  requirements: (typeof CATEGORY_REQUIREMENTS)[AiRoutingCategory],
) {
  let score = 0;

  for (const capability of requirements.requiredCapabilities) {
    if (provider.capabilities.includes(capability)) {
      score += 20;
    } else if (capability === 'vision' && provider.multimodal) {
      score += 10;
    }
  }

  if (requirements.preferLongContext) {
    score += Math.min(30, Math.floor(provider.contextWindow / 10000));
  }

  if (requirements.preferLowLatency) {
    if (provider.averageLatencyMs != null && provider.averageLatencyMs <= 1500) {
      score += 15;
    }
    score += Math.max(0, 10 - Math.floor(provider.inputCostPer1kTokensCents / 10));
  }

  if (provider.averageLatencyMs != null && provider.averageLatencyMs <= 3000) {
    score += 5;
  }

  return score;
}

export function estimateModelCostCents(
  pricingMetadata: Record<string, unknown>,
  promptTokens: number,
  completionTokens: number,
) {
  const inputPer1k = Number(
    pricingMetadata.inputPer1kTokensCents ?? pricingMetadata.inputCostPer1k ?? 0,
  );
  const outputPer1k = Number(
    pricingMetadata.outputPer1kTokensCents ?? pricingMetadata.outputCostPer1k ?? 0,
  );
  return Math.round((promptTokens / 1000) * inputPer1k + (completionTokens / 1000) * outputPer1k);
}
