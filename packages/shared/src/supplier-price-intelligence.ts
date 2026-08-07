export type SupplierPriceImportStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'review_required';

export type SupplierPriceLineStatus =
  | 'raw'
  | 'matched'
  | 'review'
  | 'approved'
  | 'rejected'
  | 'uncertain';

export type SupplierPriceDedupVerdict = 'new' | 'duplicate' | 'variant' | 'uncertain';

export type SupplierPriceImportLineInput = {
  lineNumber?: number;
  supplierCode?: string | null;
  description: string;
  unit?: string | null;
  packSize?: string | null;
  unitCostCents: number;
  vatIncluded?: boolean;
  effectiveDate?: string | null;
  rawPayload?: Record<string, unknown>;
};

export type SupplierPriceCatalogueCandidate = {
  id: string;
  canonicalCode: string | null;
  description: string;
  normalizedDescription: string;
  unit: string | null;
  packSize: string | null;
  unitCostCents: number;
  version: number;
};

export type SupplierPriceDedupResult = {
  verdict: SupplierPriceDedupVerdict;
  matchedCatalogueItemId: string | null;
  confidence: number;
  reasons: string[];
  requiresReview: boolean;
};

export type SupplierPriceDashboardCounts = {
  catalogueItems: number;
  activeCatalogueItems: number;
  pendingReview: number;
  importJobsTotal: number;
  importJobsReviewRequired: number;
  uncertainLines: number;
};

export type SupplierPriceImportJobSummary = {
  id: string;
  status: SupplierPriceImportStatus;
  sourceFilename: string | null;
  lineCount: number;
  reviewCount: number;
  createdAt: string;
  completedAt: string | null;
};

export type SupplierPriceReviewQueueItemSummary = {
  id: string;
  importLineId: string;
  reason: string;
  status: string;
  marginImpactCents: number | null;
  description: string;
  supplierCode: string | null;
  unitCostCents: number;
  createdAt: string;
};

/** Normalize supplier descriptions for dedup — never deletes source text. */
export function normalizeSupplierPriceDescription(description: string): string {
  return description
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s./-]/g, '');
}

export function classifySupplierPriceDedup(input: {
  line: SupplierPriceImportLineInput;
  candidates: SupplierPriceCatalogueCandidate[];
}): SupplierPriceDedupResult {
  const normalized = normalizeSupplierPriceDescription(input.line.description);
  const code = input.line.supplierCode?.trim().toLowerCase() ?? null;
  const unit = input.line.unit?.trim().toLowerCase() ?? null;
  const pack = input.line.packSize?.trim().toLowerCase() ?? null;

  if (!normalized) {
    return {
      verdict: 'uncertain',
      matchedCatalogueItemId: null,
      confidence: 0,
      reasons: ['empty_description'],
      requiresReview: true,
    };
  }

  let best: SupplierPriceCatalogueCandidate | null = null;
  let bestScore = 0;
  const reasons: string[] = [];

  for (const candidate of input.candidates) {
    let score = 0;

    if (code && candidate.canonicalCode?.trim().toLowerCase() === code) {
      score += 0.45;
      reasons.push('code_match');
    }

    if (candidate.normalizedDescription === normalized) {
      score += 0.35;
    } else if (
      candidate.normalizedDescription.includes(normalized) ||
      normalized.includes(candidate.normalizedDescription)
    ) {
      score += 0.15;
    }

    const candidateUnit = candidate.unit?.trim().toLowerCase() ?? null;
    if (unit && candidateUnit && unit === candidateUnit) {
      score += 0.1;
    }

    const candidatePack = candidate.packSize?.trim().toLowerCase() ?? null;
    if (pack && candidatePack && pack === candidatePack) {
      score += 0.1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (!best || bestScore < 0.35) {
    return {
      verdict: 'new',
      matchedCatalogueItemId: null,
      confidence: bestScore,
      reasons: ['no_confident_catalogue_match'],
      requiresReview: false,
    };
  }

  const priceDelta = Math.abs(input.line.unitCostCents - best.unitCostCents);
  const priceChanged = priceDelta > 0;

  if (bestScore >= 0.75 && !priceChanged) {
    return {
      verdict: 'duplicate',
      matchedCatalogueItemId: best.id,
      confidence: bestScore,
      reasons: [...new Set(reasons)],
      requiresReview: false,
    };
  }

  if (bestScore >= 0.55) {
    return {
      verdict: priceChanged ? 'variant' : 'duplicate',
      matchedCatalogueItemId: best.id,
      confidence: bestScore,
      reasons: priceChanged ? [...new Set(reasons), 'price_change'] : [...new Set(reasons)],
      requiresReview: priceChanged,
    };
  }

  return {
    verdict: 'uncertain',
    matchedCatalogueItemId: best.id,
    confidence: bestScore,
    reasons: [...new Set(reasons), 'low_confidence'],
    requiresReview: true,
  };
}
