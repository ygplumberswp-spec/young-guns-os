'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DashboardLayout } from '@/components/layout/dashboard-layout';

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/reporting/dashboard').then((res) => res.data.data),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
                <div className="h-8 bg-gray-200 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <StatCard title="Today's Jobs" value={stats?.todayJobs || 0} color="blue" />
            <StatCard title="Pending Bookings" value={stats?.pendingBookings || 0} color="amber" />
            <StatCard title="Open Quotes" value={stats?.openQuotes || 0} color="green" />
            <StatCard title="Overdue Invoices" value={stats?.overdueInvoices || 0} color="red" />
            <StatCard
              title="Monthly Revenue"
              value={`$${Number(stats?.monthRevenue || 0).toLocaleString()}`}
              color="emerald"
            />
            <StatCard title="Month Jobs" value={stats?.monthJobs || 0} color="purple" />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function StatCard({ title, value, color }: { title: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };

  return (
    <div className={`rounded-lg border p-6 ${colorMap[color] || colorMap.blue}`}>
      <p className="text-sm font-medium opacity-75">{title}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
  );
}
