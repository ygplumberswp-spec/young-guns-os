/**
 * Normalise a vehicle registration for exact-match comparison.
 * Preserves the original display value elsewhere — this is comparison-only.
 */
export function normalizeVehicleRegistration(registration: string | null | undefined): string | null {
  if (!registration) {
    return null;
  }

  const trimmed = registration.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/[\s\-_./]/g, '').toLowerCase();
}

export type VehicleRegistrationMatchResult =
  | { kind: 'none' }
  | { kind: 'unique'; vehicleId: string }
  | { kind: 'ambiguous'; vehicleIds: string[] };

export function matchVehicleByRegistration<T extends { id: string; licensePlate: string | null }>(
  companyVehicles: T[],
  registration: string | null | undefined,
): VehicleRegistrationMatchResult {
  const normalized = normalizeVehicleRegistration(registration);
  if (!normalized) {
    return { kind: 'none' };
  }

  const matches = companyVehicles.filter(
    (vehicle) =>
      vehicle.licensePlate &&
      normalizeVehicleRegistration(vehicle.licensePlate) === normalized,
  );

  if (matches.length === 0) {
    return { kind: 'none' };
  }

  if (matches.length === 1) {
    return { kind: 'unique', vehicleId: matches[0]!.id };
  }

  return { kind: 'ambiguous', vehicleIds: matches.map((vehicle) => vehicle.id) };
}

export type IntegrationMappingReviewCategory =
  | 'auto_matched'
  | 'needs_review'
  | 'no_titan_vehicle'
  | 'ambiguous_match';

export function deriveMappingReviewCategory(input: {
  status: 'unmapped' | 'mapped' | 'ignored';
  vehicleId: string | null;
  match: VehicleRegistrationMatchResult;
}): IntegrationMappingReviewCategory {
  if (input.status === 'mapped' && input.vehicleId) {
    if (input.match.kind === 'unique' && input.match.vehicleId === input.vehicleId) {
      return 'auto_matched';
    }
    return 'needs_review';
  }

  if (input.status === 'ignored') {
    return 'needs_review';
  }

  if (input.match.kind === 'ambiguous') {
    return 'ambiguous_match';
  }

  if (input.match.kind === 'none') {
    return 'no_titan_vehicle';
  }

  return 'needs_review';
}

export const INTEGRATION_MAPPING_REVIEW_LABELS: Record<IntegrationMappingReviewCategory, string> = {
  auto_matched: 'Automatically matched',
  needs_review: 'Needs review',
  no_titan_vehicle: 'No TITAN vehicle found',
  ambiguous_match: 'Ambiguous match',
};
