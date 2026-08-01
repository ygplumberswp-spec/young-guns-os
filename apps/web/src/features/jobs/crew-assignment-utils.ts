import type { JobCrewRole, JobCrewMemberSummary } from '@titan/shared';

export type CrewMemberDraft = {
  userId: string;
  crewRole: JobCrewRole;
  isPrimary: boolean;
};

export const CREW_ROLE_OPTIONS: { value: JobCrewRole; label: string }[] = [
  { value: 'crew_leader', label: 'Crew leader' },
  { value: 'driver', label: 'Driver' },
  { value: 'qualified', label: 'Qualified plumber' },
  { value: 'semi_skilled', label: 'Semi-skilled' },
  { value: 'assistant', label: 'Assistant / apprentice' },
];

export function createEmptyMemberDraft(isPrimary = false): CrewMemberDraft {
  return { userId: '', crewRole: 'assistant', isPrimary };
}

export function membersFromExecution(
  crew: JobCrewMemberSummary[],
  fallbackUserId: string | null,
): CrewMemberDraft[] {
  if (crew.length >= 2) {
    return crew.map((member) => ({
      userId: member.userId,
      crewRole: member.crewRole,
      isPrimary: member.isPrimary,
    }));
  }

  const first = crew[0]?.userId ?? fallbackUserId ?? '';
  return [
    {
      userId: first,
      crewRole: crew[0]?.crewRole ?? 'crew_leader',
      isPrimary: true,
    },
    createEmptyMemberDraft(false),
  ];
}

export function validateCrewAssignmentDraft(members: CrewMemberDraft[]): string | null {
  if (members.length < 2 || members.length > 4) {
    return 'Assign between 2 and 4 crew members (Young Guns runs 2–4 workers per vehicle).';
  }

  const filled = members.filter((member) => member.userId);
  if (filled.length !== members.length) {
    return 'Select a team member for every crew slot.';
  }

  const ids = filled.map((member) => member.userId);
  if (new Set(ids).size !== ids.length) {
    return 'Each crew member must be unique.';
  }

  const primaryCount = members.filter((member) => member.isPrimary).length;
  if (primaryCount !== 1) {
    return 'Mark exactly one crew member as the lead.';
  }

  return null;
}
