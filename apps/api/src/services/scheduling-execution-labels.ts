/** Format crew names from execution table for calendar cards. */
export function formatSchedulingCrewLabel(names: string[]): string | null {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (unique.length === 0) return null;
  if (unique.length <= 2) return unique.join(', ');
  return `${unique.slice(0, 2).join(', ')} +${unique.length - 2}`;
}

/** Format vehicle assignment for calendar cards. */
export function formatSchedulingVehicleLabel(name: string, licensePlate: string): string {
  const trimmedName = name.trim();
  const trimmedPlate = licensePlate.trim();
  if (trimmedName && trimmedPlate) return `${trimmedName} (${trimmedPlate})`;
  return trimmedName || trimmedPlate || 'Vehicle';
}
