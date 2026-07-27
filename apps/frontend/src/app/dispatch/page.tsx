'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DashboardLayout } from '@/components/layout/dashboard-layout';

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-800',
  NORMAL: 'bg-blue-100 text-blue-800',
  HIGH: 'bg-orange-100 text-orange-800',
  URGENT: 'bg-red-100 text-red-800',
  EMERGENCY: 'bg-red-200 text-red-900',
};

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  SCHEDULED: 'bg-blue-100 text-blue-800',
  DISPATCHED: 'bg-indigo-100 text-indigo-800',
  EN_ROUTE: 'bg-purple-100 text-purple-800',
  ON_SITE: 'bg-cyan-100 text-cyan-800',
  IN_PROGRESS: 'bg-orange-100 text-orange-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

function getToday(): string {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

export default function DispatchPage() {
  const [date, setDate] = useState(getToday);

  const { data, isLoading } = useQuery({
    queryKey: ['dispatch-board', date],
    queryFn: () =>
      api
        .get('/dispatch/board', { params: { date } })
        .then((res) => res.data.data),
  });

  const unassignedJobs = data?.unassignedJobs || data?.unassigned || [];
  const dispatchedJobs = data?.dispatchedJobs || data?.dispatched || data?.technicians || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Dispatch Board</h1>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Unassigned Jobs</h2>
              {unassignedJobs.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                  <p className="text-gray-500">No unassigned jobs</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {unassignedJobs.map((job: any) => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Dispatched Jobs</h2>
              {dispatchedJobs.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                  <p className="text-gray-500">No dispatched jobs</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Array.isArray(dispatchedJobs) && dispatchedJobs.map((item: any) => {
                    if (item.jobs) {
                      return item.jobs.map((job: any) => (
                        <JobCard key={job.id} job={job} technicianName={item.technicianName || `${item.technician?.firstName || ''} ${item.technician?.lastName || ''}`.trim()} />
                      ));
                    }
                    return <JobCard key={item.id} job={item} />;
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function JobCard({ job, technicianName }: { job: any; technicianName?: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 border-l-4 border-brand-500 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">{job.title || job.jobNumber || 'Untitled Job'}</h3>
        <div className="flex gap-1.5">
          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${priorityColors[job.priority] || 'bg-gray-100 text-gray-800'}`}>
            {job.priority || '-'}
          </span>
          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusColors[job.status] || 'bg-gray-100 text-gray-800'}`}>
            {job.status?.replace(/_/g, ' ') || '-'}
          </span>
        </div>
      </div>

      <div className="space-y-1 text-sm text-gray-600">
        {(job.customer?.firstName || job.customerName) && (
          <p>
            <span className="font-medium text-gray-700">Customer:</span>{' '}
            {job.customerName || `${job.customer?.firstName || ''} ${job.customer?.lastName || ''}`.trim()}
          </p>
        )}
        {(job.address || job.suburb || job.location) && (
          <p>
            <span className="font-medium text-gray-700">Location:</span>{' '}
            {job.address || job.suburb || job.location}
          </p>
        )}
        {technicianName && (
          <p>
            <span className="font-medium text-gray-700">Technician:</span> {technicianName}
          </p>
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {[0, 1].map((col) => (
        <div key={col} className="space-y-3">
          <div className="h-6 bg-gray-200 rounded w-1/3 animate-pulse mb-4" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-4 space-y-3 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
              <div className="h-3 bg-gray-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
