export type RecruitingStatus =
  | 'new'
  | 'applied'
  | 'screening'
  | 'interview'
  | 'assessment'
  | 'offered'
  | 'offer'
  | 'hired'
  | 'rejected';

export const RECRUITING_STATUS_OPTIONS: Array<{ value: RecruitingStatus; label: string }> = [
  { value: 'applied', label: 'Applied' },
  { value: 'new', label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'interview', label: 'Interview' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'offer', label: 'Offer' },
  { value: 'offered', label: 'Offer' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
];

export type RecruitingCandidateSummary = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
  status: RecruitingStatus;
  source: string | null;
  skills: string[];
  notes: string | null;
  applicationCount: number;
  createdAt: string;
  updatedAt: string;
};

export type RecruitingCandidateDetail = RecruitingCandidateSummary & {
  applications: RecruitingApplicationSummary[];
};

export type RecruitingApplicationSummary = {
  id: string;
  candidateId: string;
  candidateName: string;
  roleTitle: string;
  status: RecruitingStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecruitingStats = {
  candidateCount: number;
  applicationCount: number;
  newCount: number;
  interviewCount: number;
};

export type CreateRecruitingCandidateRequest = {
  name: string;
  email?: string | null;
  phone?: string | null;
  roleTitle?: string | null;
  status?: RecruitingStatus;
  source?: string | null;
  skills?: string[];
  notes?: string | null;
};

export type UpdateRecruitingCandidateRequest = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  roleTitle?: string | null;
  status?: RecruitingStatus;
  source?: string | null;
  skills?: string[];
  notes?: string | null;
};

export type CreateRecruitingApplicationRequest = {
  candidateId: string;
  roleTitle: string;
  status?: RecruitingStatus;
  notes?: string | null;
};

export type UpdateRecruitingApplicationRequest = {
  roleTitle?: string;
  status?: RecruitingStatus;
  notes?: string | null;
};
