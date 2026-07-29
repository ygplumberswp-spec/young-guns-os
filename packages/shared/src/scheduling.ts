export type JobAssignee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleName: string;
};

export type ScheduledJobEvent = {
  id: string;
  title: string;
  status: string;
  customerId: string;
  customerName: string;
  scheduledAt: string;
  scheduledEndAt: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
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
