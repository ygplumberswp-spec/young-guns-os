import type { JobAddressInput, JobPriority, JobSiteContactInput } from './job-contract.js';

export type JobStatus = 'new' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type { JobPriority, JobAddressInput, JobSiteContactInput };

export const JOB_STATUS_OPTIONS: Array<{ value: JobStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export type JobAddressSnapshot = {
  street: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  unit: string | null;
  display: string | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  formattedAddress: string | null;
};

export type JobSiteContactSnapshot = {
  name: string | null;
  mobile: string | null;
  email: string | null;
  emailIsPlaceholder: boolean;
  differsFromCustomer: boolean;
};

export type JobSummary = {
  id: string;
  jobNumber: string | null;
  customerId: string;
  customerName: string;
  propertyId: string | null;
  title: string;
  jobType: string | null;
  priority: JobPriority;
  status: JobStatus;
  addressDisplay: string | null;
  siteContactMobile: string | null;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  createdAt: string;
  updatedAt: string;
  /** Customer-visible technician ETA when tracking applies (portal/mobile). */
  etaAt: string | null;
};

export type JobDocumentLink = {
  id: string;
  title: string;
  fileName: string;
  fileType: string | null;
  createdAt: string;
};

export type JobDetail = JobSummary & {
  description: string | null;
  notes: string | null;
  customerVisibleNotes: string | null;
  accessInstructions: string | null;
  address: JobAddressSnapshot;
  siteContact: JobSiteContactSnapshot;
  documents: JobDocumentLink[];
};

export type JobsStats = {
  totalCount: number;
  activeCount: number;
  /** UX-012 — jobs scheduled for the company-local calendar day (scheduled/in_progress). */
  todayScheduledCount: number;
};

export type CreateJobPropertyInput = {
  propertyName?: string | null;
  street: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
  unit?: string | null;
  isPrimary?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  formattedAddress?: string | null;
  geocodeStatus?: 'unverified' | 'verified' | 'failed' | null;
};

export type CreateJobDocumentInput = {
  title: string;
  fileName: string;
  fileType?: string | null;
  fileSizeBytes?: number | null;
};

/**
 * UX-A create payload — title and status are system-owned (auto title, default New).
 */
export type CreateJobRequest = {
  customerId: string;
  /** Existing CX/CRM property. Omit when creating a new site address. */
  propertyId?: string | null;
  /** Create a new property/site for the customer. */
  newProperty?: CreateJobPropertyInput | null;
  /**
   * Explicit address override (required when neither property has a full address
   * nor newProperty is supplied). Prefer newProperty or propertyId + autofill.
   */
  address?: JobAddressInput | null;
  siteContact: JobSiteContactInput;
  siteContactDiffersFromCustomer?: boolean;
  jobType: string;
  description: string;
  priority?: JobPriority;
  preferredAppointmentAt?: string | null;
  scheduledEndAt?: string | null;
  assignedUserId?: string | null;
  accessInstructions?: string | null;
  notes?: string | null;
  customerVisibleNotes?: string | null;
  /** Never silent — only updates customer when true. */
  updateVerifiedCustomerDetails?: boolean;
  /** Never silent — only updates property address when true. */
  updateVerifiedPropertyDetails?: boolean;
  documents?: CreateJobDocumentInput[];
};

export type UpdateJobRequest = {
  customerId?: string;
  title?: string;
  jobType?: string | null;
  description?: string | null;
  status?: JobStatus;
  priority?: JobPriority;
  scheduledAt?: string | null;
  scheduledEndAt?: string | null;
  assignedUserId?: string | null;
  notes?: string | null;
  customerVisibleNotes?: string | null;
  accessInstructions?: string | null;
};

export type CustomerPropertySummary = {
  id: string;
  customerId: string;
  propertyName: string;
  street: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  unit: string | null;
  addressDisplay: string | null;
  isPrimary: boolean;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  formattedAddress: string | null;
  geocodedAt: string | null;
  geocodeStatus: 'unverified' | 'verified' | 'failed' | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateCustomerPropertyRequest = {
  propertyName: string;
  street?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  unit?: string | null;
  isPrimary?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  formattedAddress?: string | null;
  geocodeStatus?: 'unverified' | 'verified' | 'failed' | null;
};

export type UpdateCustomerPropertyRequest = {
  propertyName?: string;
  street?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  unit?: string | null;
  isPrimary?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  formattedAddress?: string | null;
  geocodeStatus?: 'unverified' | 'verified' | 'failed' | null;
};
