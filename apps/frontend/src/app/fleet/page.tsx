'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DashboardLayout } from '@/components/layout/dashboard-layout';

const statusColors: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-800',
  IN_USE: 'bg-blue-100 text-blue-800',
  MAINTENANCE: 'bg-yellow-100 text-yellow-800',
  OUT_OF_SERVICE: 'bg-red-100 text-red-800',
};

const typeBadgeColors: Record<string, string> = {
  VAN: 'bg-indigo-100 text-indigo-700',
  UTE: 'bg-orange-100 text-orange-700',
  TRUCK: 'bg-slate-100 text-slate-700',
  CAR: 'bg-cyan-100 text-cyan-700',
};

export default function FleetPage() {
  const { data: vehicles, isLoading } = useQuery({
    queryKey: ['fleet-vehicles'],
    queryFn: () => api.get('/fleet/vehicles').then((res) => res.data.data),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Fleet Management</h1>

        {isLoading ? (
          <LoadingSkeleton />
        ) : !vehicles || vehicles.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registration</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Make &amp; Model</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Odometer (km)</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Next Service</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {vehicles.map((vehicle: any) => (
                    <tr key={vehicle.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{vehicle.registration}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {vehicle.make} {vehicle.model}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{vehicle.year}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${typeBadgeColors[vehicle.type] || 'bg-gray-100 text-gray-700'}`}
                        >
                          {vehicle.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusColors[vehicle.status] || 'bg-gray-100 text-gray-800'}`}
                        >
                          {vehicle.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {vehicle.odometer != null ? Number(vehicle.odometer).toLocaleString() : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {vehicle.nextServiceDate
                          ? new Date(vehicle.nextServiceDate).toLocaleDateString()
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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

function EmptyState() {
  return (
    <div className="bg-white rounded-lg shadow p-12 text-center">
      <p className="text-gray-500">No vehicles found</p>
    </div>
  );
}
