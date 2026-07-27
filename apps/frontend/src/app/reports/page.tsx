'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DashboardLayout } from '@/components/layout/dashboard-layout';

const reports = [
  {
    title: 'Revenue Report',
    description: 'View revenue breakdown by period, branch, and service type.',
    abbreviation: 'RR',
    color: 'bg-emerald-500',
  },
  {
    title: 'Technician Performance',
    description: 'Track job completion rates, average times, and customer ratings per technician.',
    abbreviation: 'TP',
    color: 'bg-blue-500',
  },
  {
    title: 'Job Type Breakdown',
    description: 'Analyse distribution of jobs across categories and service types.',
    abbreviation: 'JT',
    color: 'bg-purple-500',
  },
  {
    title: 'Overdue Invoices',
    description: 'Review outstanding invoices past their due date and aging summary.',
    abbreviation: 'OI',
    color: 'bg-red-500',
  },
];

export default function ReportsPage() {
  // Pre-fetch dashboard stats to show quick numbers on the page
  const { isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/reporting/dashboard').then((res) => res.data.data),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gray-200 rounded-full" />
                  <div className="flex-1 space-y-3">
                    <div className="h-5 bg-gray-200 rounded w-1/2" />
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reports.map((report) => (
              <button
                key={report.title}
                className="bg-white rounded-lg shadow p-6 text-left hover:shadow-md hover:ring-1 hover:ring-gray-200 transition-all cursor-pointer group"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 ${report.color} rounded-full flex items-center justify-center flex-shrink-0`}
                  >
                    <span className="text-white font-bold text-sm">{report.abbreviation}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">
                      {report.title}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">{report.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
