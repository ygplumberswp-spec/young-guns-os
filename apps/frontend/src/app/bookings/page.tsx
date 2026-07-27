'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DashboardLayout } from '@/components/layout/dashboard-layout';

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  SCHEDULED: 'bg-indigo-100 text-indigo-800',
  CANCELLED: 'bg-red-100 text-red-800',
  COMPLETED: 'bg-green-100 text-green-800',
  NO_SHOW: 'bg-gray-100 text-gray-800',
};

export default function BookingsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['bookings', statusFilter, page],
    queryFn: () =>
      api
        .get('/bookings', { params: { page, limit: 20, status: statusFilter || undefined } })
        .then((res) => res.data),
  });

  const bookings = data?.data || [];
  const meta = data?.meta;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Statuses</option>
            {Object.keys(statusColors).map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <LoadingSkeleton />
        ) : bookings.length === 0 ? (
          <EmptyState message="No bookings found" />
        ) : (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Preferred Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time Slot</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {bookings.map((booking: any) => (
                    <tr key={booking.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {booking.customerName || `${booking.customer?.firstName || ''} ${booking.customer?.lastName || ''}`.trim() || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{booking.phone || booking.customer?.phone || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {booking.preferredDate ? new Date(booking.preferredDate).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{booking.timeSlot || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusColors[booking.status] || 'bg-gray-100 text-gray-800'}`}>
                          {booking.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{booking.source || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {meta && meta.totalPages > 1 && (
              <Pagination page={page} totalPages={meta.totalPages} onPageChange={setPage} />
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function LoadingSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-12 text-center">
      <p className="text-gray-500">{message}</p>
    </div>
  );
}

function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-gray-600">Page {page} of {totalPages}</p>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
