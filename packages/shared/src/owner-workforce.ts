import type { YoungGunsPayrollRulesSummary } from './young-guns-payroll.js';

export type OwnerWorkforceMemberStatus =
  | 'working'
  | 'available'
  | 'travelling'
  | 'on_site'
  | 'off_duty'
  | 'leave';

export type OwnerWorkforceJobRef = {
  id: string;
  title: string;
  jobNumber: string | null;
};

export type OwnerWorkforceVehicleRef = {
  id: string;
  name: string;
  licensePlate: string;
};

export type OwnerWorkforceCertificationRef = {
  name: string;
  expiresAt: string | null;
  isExpiringSoon: boolean;
};

export type OwnerWorkforceMember = {
  userId: string;
  name: string;
  roleName: string | null;
  status: OwnerWorkforceMemberStatus;
  attendance: {
    checkedIn: boolean;
    checkInAt: string | null;
    missingCheckIn: boolean;
  };
  currentJob: OwnerWorkforceJobRef | null;
  nextJob: OwnerWorkforceJobRef | null;
  vehicle: OwnerWorkforceVehicleRef | null;
  hoursToday: {
    standardHours: number;
    overtimeHours: number;
    totalHours: number;
    breakHours: number;
    saturdayOvertime: boolean;
  };
  jobsCompletedToday: number;
  isDelayed: boolean;
  missingTimesheet: boolean;
  onLeave: boolean;
  certifications: OwnerWorkforceCertificationRef[];
};

export type OwnerWorkforceSummary = {
  teamCount: number;
  checkedInCount: number;
  missingCheckInCount: number;
  overtimeHoursTotal: number;
  missingTimesheetsCount: number;
  onLeaveCount: number;
  delayedCount: number;
  jobsCompletedToday: number;
};

export type OwnerWorkforceView = {
  date: string;
  payrollRules: YoungGunsPayrollRulesSummary;
  summary: OwnerWorkforceSummary;
  members: OwnerWorkforceMember[];
  disclaimer: string;
};
