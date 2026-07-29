import { useEffect, useState } from 'react';
import { PageHeader, Panel } from '@titan/ui';
import { PortalApiClientError, fetchPortalAppointments, createPortalRequest } from '../../lib/portal-api-client';
import { usePortalAuth } from '../../lib/portal-auth-context';

export function PortalAppointmentsPage() {
  const { accessToken } = usePortalAuth();
  const [appointments, setAppointments] = useState<Awaited<ReturnType<typeof fetchPortalAppointments>>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void fetchPortalAppointments(accessToken)
      .then(setAppointments)
      .catch((err) => setError(err instanceof PortalApiClientError ? err.message : 'Unable to load appointments'));
  }, [accessToken]);

  async function requestReschedule(jobId: string, title: string) {
    if (!accessToken) return;
    await createPortalRequest(accessToken, {
      requestType: 'appointment_reschedule',
      subject: `Reschedule request: ${title}`,
      message: 'Please reschedule this appointment.',
      entityType: 'job',
      entityId: jobId,
    });
  }

  return (
    <div className="portal-page">
      <PageHeader title="Appointments" description="View appointments and submit reschedule or cancellation requests." />
      {error ? <p className="form-error">{error}</p> : null}
      <Panel title="Scheduled appointments">
        <ul className="portal-list">
          {appointments.map((appointment) => (
            <li key={appointment.jobId}>
              <strong>{appointment.jobTitle}</strong>
              <span>{appointment.scheduledAt ? new Date(appointment.scheduledAt).toLocaleString() : 'Unscheduled'}</span>
              <button type="button" onClick={() => void requestReschedule(appointment.jobId, appointment.jobTitle)}>
                Request reschedule
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
