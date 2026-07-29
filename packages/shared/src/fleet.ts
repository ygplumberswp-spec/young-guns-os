export type VehicleStatus = 'available' | 'in_use' | 'maintenance' | 'out_of_service';

export const VEHICLE_STATUS_OPTIONS: Array<{ value: VehicleStatus; label: string }> = [
  { value: 'available', label: 'Available' },
  { value: 'in_use', label: 'In use' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'out_of_service', label: 'Out of service' },
];

export type VehicleSummary = {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  licensePlate: string;
  vin: string | null;
  status: VehicleStatus;
  assignedUserId: string | null;
  assignedUserName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VehicleDetail = VehicleSummary & {
  notes: string | null;
};

export type FleetStats = {
  totalCount: number;
  availableCount: number;
  inUseCount: number;
  maintenanceCount: number;
  assignedCount: number;
};

export type CreateVehicleRequest = {
  name: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  licensePlate: string;
  vin?: string | null;
  status?: VehicleStatus;
  assignedUserId?: string | null;
  notes?: string | null;
};

export type UpdateVehicleRequest = {
  name?: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  licensePlate?: string;
  vin?: string | null;
  status?: VehicleStatus;
  assignedUserId?: string | null;
  notes?: string | null;
};
