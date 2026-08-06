import type { ReactNode } from 'react';

/**
 * Live Operations capability seams for future expansion.
 * Active modules (GPS / Maps / Cartrack) render in LiveOperationsPanel today.
 * Reserved modules stay typed here so cameras and playback can land without a dashboard redesign.
 */

export type LiveOpsCapabilityId =
  | 'liveGps'
  | 'googleMaps'
  | 'cartrack'
  | 'vehicleCameras'
  | 'routePlayback'
  | 'driverEvents';

/** Camera angles supported when vehicle camera feeds are wired later. */
export type VehicleCameraAngle = 'front' | 'rear' | 'cabin' | 'left' | 'right';

export type LiveOpsVehicleCameraSlot = {
  angle: VehicleCameraAngle;
  vehicleId: string;
  streamUrl?: string | null;
  label?: string | null;
  recordedAt?: string | null;
};

export type LiveOpsRoutePlaybackSlot = {
  vehicleId: string;
  startedAt: string;
  endedAt?: string | null;
  points?: Array<{ latitude: number; longitude: number; recordedAt: string }>;
};

export type LiveOpsDriverEventSlot = {
  id: string;
  vehicleId: string;
  driverName?: string | null;
  eventType: string;
  occurredAt: string;
  summary?: string | null;
};

/** Optional future payloads — mount only when product enables rendering + data exists. */
export type LiveOpsFutureModules = {
  vehicleCameras?: LiveOpsVehicleCameraSlot[];
  routePlayback?: LiveOpsRoutePlaybackSlot | null;
  driverEvents?: LiveOpsDriverEventSlot[];
};

export type LiveOpsSectionDefinition = {
  id: LiveOpsCapabilityId;
  /** Product-ready today. Reserved sections stay false until wired. */
  active: boolean;
};

export const LIVE_OPS_SECTION_REGISTRY: readonly LiveOpsSectionDefinition[] = [
  { id: 'liveGps', active: true },
  { id: 'googleMaps', active: true },
  { id: 'cartrack', active: true },
  { id: 'vehicleCameras', active: false },
  { id: 'routePlayback', active: false },
  { id: 'driverEvents', active: false },
] as const;

export const VEHICLE_CAMERA_ANGLES: readonly VehicleCameraAngle[] = [
  'front',
  'rear',
  'cabin',
  'left',
  'right',
] as const;

export type LiveOpsExtensionContext = {
  registry: readonly LiveOpsSectionDefinition[];
  future: LiveOpsFutureModules | null;
  /** Future modules that have real data and could mount later — never empty placeholders. */
  pendingWithData: LiveOpsCapabilityId[];
  camerasByAngle: Partial<Record<VehicleCameraAngle, LiveOpsVehicleCameraSlot[]>>;
};

function groupCamerasByAngle(
  cameras: LiveOpsVehicleCameraSlot[] | undefined,
): Partial<Record<VehicleCameraAngle, LiveOpsVehicleCameraSlot[]>> {
  const grouped: Partial<Record<VehicleCameraAngle, LiveOpsVehicleCameraSlot[]>> = {};
  if (!cameras?.length) return grouped;
  for (const camera of cameras) {
    const list = grouped[camera.angle] ?? [];
    list.push(camera);
    grouped[camera.angle] = list;
  }
  return grouped;
}

export function createLiveOpsExtensionContext(
  future?: LiveOpsFutureModules | null,
): LiveOpsExtensionContext {
  const modules = future ?? null;
  const pendingWithData: LiveOpsCapabilityId[] = [];
  if (modules?.vehicleCameras?.length) pendingWithData.push('vehicleCameras');
  if (modules?.routePlayback) pendingWithData.push('routePlayback');
  if (modules?.driverEvents?.length) pendingWithData.push('driverEvents');

  return {
    registry: LIVE_OPS_SECTION_REGISTRY,
    future: modules,
    pendingWithData,
    camerasByAngle: groupCamerasByAngle(modules?.vehicleCameras),
  };
}

/**
 * Future section injector seam. Intentionally returns null today so the dashboard
 * never shows empty camera / playback / event cards.
 */
export function renderLiveOpsFutureSections(_ctx: LiveOpsExtensionContext): ReactNode {
  return null;
}
