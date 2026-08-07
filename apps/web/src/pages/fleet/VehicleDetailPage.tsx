import { PageHeader } from '../../components/ux';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useRoute } from 'wouter';
import { Button, Input, Panel } from '@titan/ui';
import type { JobAssignee, VehicleDetail, VehicleStatus } from '@titan/shared';
import { AI_NAME, VEHICLE_STATUS_OPTIONS } from '@titan/shared';
import { ApiClientError } from '../../lib/api-client';
import { fetchFleetAssignees, fetchVehicle, updateVehicle } from '../../lib/fleet-api';
import { useAuth } from '../../lib/auth-context';
import { canManageFleet, formatVehicleStatus } from '../../features/fleet/VehicleList';
import { VehicleTrackedPositionPanel } from '../../features/fleet/VehicleTrackedPositionPanel';

export function VehicleDetailPage() {
  const [, params] = useRoute('/fleet/:id');
  const vehicleId = params?.id ?? '';
  const { accessToken, user } = useAuth();
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [assignees, setAssignees] = useState<JobAssignee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [name, setName] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [vin, setVin] = useState('');
  const [status, setStatus] = useState<VehicleStatus>('available');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [notes, setNotes] = useState('');

  const canWrite = useMemo(() => (user ? canManageFleet(user.permissions) : false), [user]);

  async function loadVehicle() {
    if (!accessToken || !vehicleId) return;

    const [vehicleData, assigneeData] = await Promise.all([
      fetchVehicle(accessToken, vehicleId),
      fetchFleetAssignees(accessToken),
    ]);

    setVehicle(vehicleData);
    setAssignees(assigneeData);
    setName(vehicleData.name);
    setMake(vehicleData.make ?? '');
    setModel(vehicleData.model ?? '');
    setYear(vehicleData.year ? String(vehicleData.year) : '');
    setLicensePlate(vehicleData.licensePlate);
    setVin(vehicleData.vin ?? '');
    setStatus(vehicleData.status);
    setAssignedUserId(vehicleData.assignedUserId ?? '');
    setNotes(vehicleData.notes ?? '');
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!accessToken || !vehicleId) {
        setIsLoading(false);
        return;
      }

      try {
        await loadVehicle();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : 'Unable to load vehicle');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [accessToken, vehicleId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !canWrite || !vehicleId) return;

    const parsedYear = year.trim() ? Number.parseInt(year, 10) : null;
    if (year.trim() && (Number.isNaN(parsedYear!) || parsedYear! < 1900)) {
      setError('Enter a valid year');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateVehicle(accessToken, vehicleId, {
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
      await loadVehicle();
      setIsEditing(false);
      setSuccess('Vehicle updated.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Unable to update vehicle');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="page-shell">
        <PageHeader title="Vehicle" description="Vehicle record" />
        <p className="page-muted">Loading vehicle…</p>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="fleet-page">
        <PageHeader title="Vehicle Not Found" description="This vehicle may have been removed." />
      </div>
    );
  }

  return (
    <div className="fleet-page">
      <PageHeader
        title={vehicle.name}
        description={`${vehicle.licensePlate} · ${formatVehicleStatus(vehicle.status)}`}
        actions={
          <div className="fleet-detail__actions">
            {canWrite ? (
              <Button variant="secondary" onClick={() => setIsEditing((value) => !value)}>
                {isEditing ? 'Cancel edit' : 'Edit vehicle'}
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      {isEditing && canWrite ? (
        <Panel title="Edit Vehicle">
          <form className="fleet-form" onSubmit={(event) => void handleSubmit(event)}>
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input
              label="License Plate"
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
              <span className="titan-input-label">Assigned driver/technician</span>
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
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        </Panel>
      ) : (
        <Panel title="Vehicle Details">
          <dl className="fleet-detail-list">
            <div>
              <dt>License plate</dt>
              <dd>{vehicle.licensePlate}</dd>
            </div>
            <div>
              <dt>Make / model</dt>
              <dd>
                {[vehicle.make, vehicle.model, vehicle.year ? String(vehicle.year) : null]
                  .filter(Boolean)
                  .join(' ') || '—'}
              </dd>
            </div>
            <div>
              <dt>VIN</dt>
              <dd>{vehicle.vin ?? '—'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`fleet-status fleet-status--${vehicle.status}`}>
                  {formatVehicleStatus(vehicle.status)}
                </span>
              </dd>
            </div>
            <div>
              <dt>Assigned to</dt>
              <dd>{vehicle.assignedUserName ?? 'Unassigned'}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{vehicle.notes ?? '—'}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{new Date(vehicle.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </Panel>
      )}

      <VehicleTrackedPositionPanel vehicleId={vehicle.id} />

      <Panel
        title={`Ask ${AI_NAME}`}
        description="Get help with fleet planning and vehicle assignments."
      >
        <p className="page-muted">
          Open{' '}
          <Link href={`/aura?vehicleId=${vehicle.id}`} className="fleet-link">
            AURA
          </Link>{' '}
          to ask questions about this vehicle and your fleet.
        </p>
      </Panel>
    </div>
  );
}
