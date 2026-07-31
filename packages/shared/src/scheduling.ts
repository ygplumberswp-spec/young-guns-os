export type JobAssignee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleName: string;
};

export type ScheduledJobEvent = {
  id: string;
  jobNumber: string | null;
  title: string;
  status: string;
  priority: string;
  jobType: string | null;
  customerId: string;
  customerName: string;
  suburb: string | null;
  addressDisplay: string | null;
  siteContactName: string | null;
  siteContactMobile: string | null;
  accessWarning: boolean;
  accessInstructions: string | null;
  scheduledAt: string;
  scheduledEndAt: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  vehicleLabel: string | null;
  crewLabel: string | null;
};

export type SchedulingCalendarResponse = {
  from: string;
  to: string;
  scheduledCount: number;
  events: ScheduledJobEvent[];
};

export type SchedulingStats = {
  scheduledCount: number;
};

export type ScheduleJobRequest = {
  scheduledAt: string;
  scheduledEndAt?: string | null;
  assignedUserId?: string | null;
};

export type UpdateScheduleRequest = {
  scheduledAt?: string | null;
  scheduledEndAt?: string | null;
  assignedUserId?: string | null;
  clearSchedule?: boolean;
};
