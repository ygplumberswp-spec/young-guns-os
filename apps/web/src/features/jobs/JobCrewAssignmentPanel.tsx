import { FormEvent, useEffect, useState } from 'react';
import { Button, Panel } from '@titan/ui';
import type { JobAssignee, JobExecutionSummary, VehicleSummary } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchFleetAssignees, fetchVehicles } from '../../lib/fleet-api';
import { assignJobCrew } from '../../lib/jobs-api';
import {
  CREW_ROLE_OPTIONS,
  createEmptyMemberDraft,
  membersFromExecution,
  type CrewMemberDraft,
  validateCrewAssignmentDraft,
} from './crew-assignment-utils';

type JobCrewAssignmentPanelProps = {
  accessToken: string;
  jobId: string;
  assignedUserId: string | null;
  execution: JobExecutionSummary | null;
  onUpdated: () => void;
};

function assigneeLabel(assignee: JobAssignee): string {
  return `${assignee.firstName} ${assignee.lastName} (${assignee.roleName})`;
}

export function JobCrewAssignmentPanel({
  accessToken,
  jobId,
  assignedUserId,
  execution,
  onUpdated,
}: JobCrewAssignmentPanelProps) {
  const [assignees, setAssignees] = useState<JobAssignee[]>([]);
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [members, setMembers] = useState<CrewMemberDraft[]>(() =>
    membersFromExecution(execution?.crew ?? [], assignedUserId),
  );
  const [vehicleId, setVehicleId] = useState(execution?.vehicle?.vehicleId ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setMembers(membersFromExecution(execution?.crew ?? [], assignedUserId));
    setVehicleId(execution?.vehicle?.vehicleId ?? '');
  }, [execution, assignedUserId]);

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      try {
        const [team, fleet] = await Promise.all([
          fetchFleetAssignees(accessToken),
          fetchVehicles(accessToken),
        ]);
        if (!cancelled) {
          setAssignees(team);
          setVehicles(fleet);
        }
      } catch {
        if (!cancelled) {
          setAssignees([]);
          setVehicles([]);
        }
      }
    }

    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  function setPrimary(index: number) {
    setMembers((prev) =>
      prev.map((member, i) => ({
        ...member,
        isPrimary: i === index,
      })),
    );
  }

  function updateMember(index: number, patch: Partial<CrewMemberDraft>) {
    setMembers((prev) =>
      prev.map((member, i) => (i === index ? { ...member, ...patch } : member)),
    );
  }

  function addMember() {
    setMembers((prev) => {
      if (prev.length >= 4) return prev;
      return [...prev, createEmptyMemberDraft(false)];
    });
  }

  function removeMember(index: number) {
    setMembers((prev) => {
      if (prev.length <= 2) return prev;
      const next = prev.filter((_, i) => i !== index);
      if (!next.some((member) => member.isPrimary)) {
        next[0] = { ...next[0]!, isPrimary: true };
      }
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateCrewAssignmentDraft(members);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const primaryUserId = members.find((member) => member.isPrimary)?.userId ?? null;
      await assignJobCrew(accessToken, jobId, {
        members: members.map(({ userId, crewRole, isPrimary }) => ({
          userId,
          crewRole,
          isPrimary,
        })),
        vehicleId: vehicleId || null,
        primaryUserId,
      });
      setSuccess('Crew and vehicle assignment saved.');
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to save crew assignment');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Panel
      title="Crew & vehicle assignment"
      description="Young Guns crews run 2–4 workers per vehicle. Assign roles and an active vehicle for dispatch and field execution."
    >
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <form className="jobs-form" onSubmit={(event) => void handleSubmit(event)}>
        {members.map((member, index) => (
          <div key={index} className="jobs-form__section">
            <p className="jobs-form__section-title">Crew member {index + 1}</p>
            <div className="jobs-form__grid">
              <label className="titan-input-group">
                <span className="titan-input-label">Team member</span>
                <select
                  className="titan-input"
                  value={member.userId}
                  onChange={(event) => updateMember(index, { userId: event.target.value })}
                  required
                >
                  <option value="">Select…</option>
                  {assignees.map((assignee) => (
                    <option key={assignee.id} value={assignee.id}>
                      {assigneeLabel(assignee)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="titan-input-group">
                <span className="titan-input-label">Role</span>
                <select
                  className="titan-input"
                  value={member.crewRole}
                  onChange={(event) =>
                    updateMember(index, {
                      crewRole: event.target.value as CrewMemberDraft['crewRole'],
                    })
                  }
                >
                  {CREW_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="titan-input-group">
                <span className="titan-input-label">Lead</span>
                <label className="jobs-checkbox-row">
                  <input
                    type="radio"
                    name="crew-primary"
                    checked={member.isPrimary}
                    onChange={() => setPrimary(index)}
                  />
                  <span>Crew lead / primary assignee</span>
                </label>
              </label>
            </div>

            {members.length > 2 ? (
              <div className="jobs-form__actions">
                <Button type="button" variant="ghost" size="sm" onClick={() => removeMember(index)}>
                  Remove member
                </Button>
              </div>
            ) : null}
          </div>
        ))}

        {members.length < 4 ? (
          <div className="jobs-form__actions">
            <Button type="button" variant="secondary" size="sm" onClick={addMember}>
              Add crew member
            </Button>
          </div>
        ) : null}

        <label className="titan-input-group">
          <span className="titan-input-label">Vehicle (optional)</span>
          <select
            className="titan-input"
            value={vehicleId}
            onChange={(event) => setVehicleId(event.target.value)}
          >
            <option value="">No vehicle assigned</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.name} ({vehicle.licensePlate})
              </option>
            ))}
          </select>
        </label>

        <div className="jobs-form__actions">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save crew assignment'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
