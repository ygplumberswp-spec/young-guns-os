export type JobStatus = 'new' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export const JOB_STATUS_OPTIONS: Array<{ value: JobStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export type JobSummary = {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  status: JobStatus;
  scheduledAt: string | null;
  scheduledEndAt: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobDetail = JobSummary & {
  description: string | null;
  notes: string | null;
};

export type JobsStats = {
  totalCount: number;
  activeCount: number;
};

export type CreateJobRequest = {
  customerId: string;
  title: string;
  description?: string | null;
  status?: JobStatus;
  scheduledAt?: string | null;
  scheduledEndAt?: string | null;
  assignedUserId?: string | null;
  notes?: string | null;
};

export type UpdateJobRequest = {
  customerId?: string;
  title?: string;
  description?: string | null;
  status?: JobStatus;
  scheduledAt?: string | null;
  scheduledEndAt?: string | null;
  assignedUserId?: string | null;
  notes?: string | null;
};
