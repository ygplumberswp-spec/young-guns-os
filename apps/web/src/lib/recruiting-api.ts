import type {
  CreateRecruitingApplicationRequest,
  CreateRecruitingCandidateRequest,
  RecruitingApplicationSummary,
  RecruitingCandidateDetail,
  RecruitingCandidateSummary,
  RecruitingStats,
  UpdateRecruitingApplicationRequest,
  UpdateRecruitingCandidateRequest,
} from '@titan/shared';
import { request } from './api-client';

export async function fetchRecruitingStats(accessToken: string): Promise<RecruitingStats> {
  const data = await request<{ stats: RecruitingStats }>('/recruiting/stats', { accessToken });
  return data.stats;
}

export async function fetchRecruitingCandidates(
  accessToken: string,
): Promise<RecruitingCandidateSummary[]> {
  const data = await request<{ candidates: RecruitingCandidateSummary[] }>('/recruiting/candidates', {
    accessToken,
  });
  return data.candidates;
}

export async function fetchRecruitingCandidate(
  accessToken: string,
  candidateId: string,
): Promise<RecruitingCandidateDetail> {
  const data = await request<{ candidate: RecruitingCandidateDetail }>(
    `/recruiting/candidates/${candidateId}`,
    { accessToken },
  );
  return data.candidate;
}

export async function createRecruitingCandidate(
  accessToken: string,
  body: CreateRecruitingCandidateRequest,
): Promise<RecruitingCandidateDetail> {
  const data = await request<{ candidate: RecruitingCandidateDetail }>('/recruiting/candidates', {
    method: 'POST',
    accessToken,
    body,
  });
  return data.candidate;
}

export async function updateRecruitingCandidate(
  accessToken: string,
  candidateId: string,
  body: UpdateRecruitingCandidateRequest,
): Promise<RecruitingCandidateDetail> {
  const data = await request<{ candidate: RecruitingCandidateDetail }>(
    `/recruiting/candidates/${candidateId}`,
    { method: 'PATCH', accessToken, body },
  );
  return data.candidate;
}

export async function fetchRecruitingApplications(
  accessToken: string,
): Promise<RecruitingApplicationSummary[]> {
  const data = await request<{ applications: RecruitingApplicationSummary[] }>(
    '/recruiting/applications',
    { accessToken },
  );
  return data.applications;
}

export async function createRecruitingApplication(
  accessToken: string,
  body: CreateRecruitingApplicationRequest,
): Promise<RecruitingApplicationSummary> {
  const data = await request<{ application: RecruitingApplicationSummary }>(
    '/recruiting/applications',
    { method: 'POST', accessToken, body },
  );
  return data.application;
}

export async function updateRecruitingApplication(
  accessToken: string,
  applicationId: string,
  body: UpdateRecruitingApplicationRequest,
): Promise<RecruitingApplicationSummary> {
  const data = await request<{ application: RecruitingApplicationSummary }>(
    `/recruiting/applications/${applicationId}`,
    { method: 'PATCH', accessToken, body },
  );
  return data.application;
}
