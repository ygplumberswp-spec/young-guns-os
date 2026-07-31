import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Button, Input, PageHeader } from '@titan/ui';
import type { JobAssignee, VehicleStatus } from '@titan/shared';
import { VEHICLE_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { createVehicle, fetchFleetAssignees } from '../../lib/fleet-api';
import { useAuth } from '../../lib/auth-context';
import { canManageFleet } from '../../features/fleet/VehicleList';

export function VehicleCreatePage() {
  const { accessToken, user } = useAuth();
  const [, navigate] = useLocation();
  const [assignees, setAssignees] = useState<JobAssignee[]>([]);
  const [name, setName] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [vin, setVin] = useState('');
  const [status, setStatus] = useState<VehicleStatus>('available');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = user ? canManageFleet(user.permissions) : false;

  useEffect(() => {
    if (user && !canWrite) navigate('/fleet');
  }, [canWrite, navigate, user]);

  useEffect(() => {
    let cancelled = false;

    async function loadAssignees() {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await fetchFleetAssignees(accessToken);
        if (!cancelled) setAssignees(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load team members');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadAssignees();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite) return;

    const parsedYear = year.trim() ? Number.parseInt(year, 10) : null;
    if (year.trim() && (Number.isNaN(parsedYear!) || parsedYear! < 1900)) {
      setError('Enter a valid year');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const vehicle = await createVehicle(accessToken, {
        name,
        make: make.trim() || null,
        model: model.trim() || null,
        year: parsedYear,
        licensePlate,
        vin: vin.trim() || null,
        status,
        assignedUserId: assignedUserId || null,
        notes: notes.trim() || null,
      });
      navigate(`/fleet/${vehicle.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to create vehicle');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <p className="page-muted">Loading form…</p>;

  return (
    <div className="fleet-page">
      <PageHeader
        title="Add vehicle"
        description="Register a company vehicle and optionally assign a driver or technician."
        actions={
          <Link href="/fleet">
            <Button variant="secondary">Back to fleet</Button>
          </Link>
        }
      />
      {error ? <p className="form-error">{error}</p> : null}

      <form className="fleet-form" onSubmit={(event) => void handleSubmit(event)}>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input
          label="License plate"
          value={licensePlate}
          onChange={(e) => setLicensePlate(e.target.value)}
          required
        />
        <Input label="Make" value={make} onChange={(e) => setMake(e.target.value)} />
        <Input label="Model" value={model} onChange={(e) => setModel(e.target.value)} />
        <Input
          label="Year"
          type="number"
          min="1900"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
        <Input label="VIN" value={vin} onChange={(e) => setVin(e.target.value)} />
        <label className="titan-input-group">
          <span className="titan-input-label">Status</span>
          <select
            className="titan-input"
            value={status}
            onChange={(e) => setStatus(e.target.value as VehicleStatus)}
          >
            {VEHICLE_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="titan-input-group">
          <span className="titan-input-label">Assigned driver/technician (optional)</span>
          <select
            className="titan-input"
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.firstName} {assignee.lastName} ({assignee.roleName})
              </option>
            ))}
          </select>
        </label>
        <label className="titan-input-group">
          <span className="titan-input-label">Notes</span>
          <textarea
            className="titan-input fleet-textarea"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={isSaving || !name.trim() || !licensePlate.trim()}>
          {isSaving ? 'Creating…' : 'Add vehicle'}
        </Button>
      </form>
    </div>
  );
}
