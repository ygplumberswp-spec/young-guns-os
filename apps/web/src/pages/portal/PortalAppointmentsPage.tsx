import { PageHeader } from '../../components/ux';
import { useEffect, useState } from 'react';
import { Button, Panel } from '@titan/ui';
import {
  PortalApiClientError,
  fetchPortalAppointments,
  createPortalRequest,
  createCxPortalBooking,
  fetchCxPortalBookings,
} from '../../lib/portal-api-client';
import type { CxAppointmentBookingSummary } from '@titan/shared';
import { usePortalAuth } from '../../lib/portal-auth-context';

export function PortalAppointmentsPage() {
  const { accessToken } = usePortalAuth();
  const [appointments, setAppointments] = useState<
    Awaited<ReturnType<typeof fetchPortalAppointments>>
  >([]);
  const [bookings, setBookings] = useState<CxAppointmentBookingSummary[]>([]);
  const [subject, setSubject] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTimeWindow, setPreferredTimeWindow] = useState('');
  const [jobNotes, setJobNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void Promise.all([fetchPortalAppointments(accessToken), fetchCxPortalBookings(accessToken)])
      .then(([appts, bookingRows]) => {
        setAppointments(appts);
        setBookings(bookingRows);
      })
      .catch((err) =>
        setError(err instanceof PortalApiClientError ? err.message : 'Unable to load appointments'),
      );
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

  async function submitBooking() {
    if (!accessToken || !subject.trim()) return;
    try {
      const booking = await createCxPortalBooking(accessToken, {
        subject: subject.trim(),
        preferredDate: preferredDate || undefined,
        preferredTimeWindow: preferredTimeWindow || undefined,
        jobNotes: jobNotes || undefined,
      });
      setBookings((current) => [booking, ...current]);
      setSubject('');
      setPreferredDate('');
      setPreferredTimeWindow('');
      setJobNotes('');
      setSuccess('Booking request submitted for approval');
    } catch (err) {
      setError(err instanceof PortalApiClientError ? err.message : 'Unable to submit booking');
    }
  }

  return (
    <div className="portal-page">
      <PageHeader
        title="Appointments"
        description="Book appointments, view confirmations, and request changes."
      />
      {error ? <p className="form-error">{error}</p> : null}
      {success ? <p className="form-success">{success}</p> : null}

      <Panel title="Book An Appointment">
        <div className="form-stack">
          <input
            type="text"
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <input
            type="date"
            value={preferredDate}
            onChange={(e) => setPreferredDate(e.target.value)}
          />
          <input
            type="text"
            placeholder="Preferred time window"
            value={preferredTimeWindow}
            onChange={(e) => setPreferredTimeWindow(e.target.value)}
          />
          <textarea
            placeholder="Job notes"
            value={jobNotes}
            onChange={(e) => setJobNotes(e.target.value)}
            rows={3}
          />
          <Button onClick={() => void submitBooking()}>Submit Booking Request</Button>
        </div>
      </Panel>

      <Panel title="Booking Requests">
        <ul className="portal-list">
          {bookings.map((booking) => (
            <li key={booking.id}>
              <strong>{booking.subject}</strong>
              <span>{booking.status.replace(/_/g, ' ')}</span>
              {booking.preferredDate ? <span>{booking.preferredDate}</span> : null}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Scheduled Appointments">
        <ul className="portal-list">
          {appointments.map((appointment) => (
            <li key={appointment.jobId}>
              <strong>{appointment.jobTitle}</strong>
              <span>
                {appointment.scheduledAt
                  ? new Date(appointment.scheduledAt).toLocaleString()
                  : 'Unscheduled'}
              </span>
              <button
                type="button"
                onClick={() => void requestReschedule(appointment.jobId, appointment.jobTitle)}
              >
                Request reschedule
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
