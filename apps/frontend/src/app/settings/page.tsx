'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DashboardLayout } from '@/components/layout/dashboard-layout';

export default function SettingsPage() {
  const {
    data: xeroStatus,
    isLoading: xeroLoading,
    refetch: refetchXero,
  } = useQuery({
    queryKey: ['xero-status'],
    queryFn: () => api.get('/xero/status').then((res) => res.data.data),
  });

  async function handleConnectXero() {
    try {
      const res = await api.get('/xero/auth-url');
      const url = res.data?.data?.url || res.data?.data;
      if (url) {
        window.location.href = url;
      }
    } catch {
      // Silently handle - user can retry
    }
  }

  async function handleDisconnectXero() {
    try {
      await api.delete('/xero/disconnect');
      refetchXero();
    } catch {
      // Silently handle - user can retry
    }
  }

  const isConnected = xeroStatus?.connected === true;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

        {/* Integration Status */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Integration Status</h2>

          <div className="bg-white rounded-lg shadow p-6">
            {xeroLoading ? (
              <div className="animate-pulse flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-200 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-gray-200 rounded w-32" />
                  <div className="h-4 bg-gray-200 rounded w-48" />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                    <span className="text-blue-700 font-bold text-lg">X</span>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Xero</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`}
                      />
                      <span className="text-sm text-gray-600">
                        {isConnected ? 'Connected' : 'Disconnected'}
                      </span>
                      {isConnected && xeroStatus?.tenantName && (
                        <span className="text-sm text-gray-400">
                          - {xeroStatus.tenantName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  {isConnected ? (
                    <button
                      onClick={handleDisconnectXero}
                      className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={handleConnectXero}
                      className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
                    >
                      Connect Xero
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* General */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">General</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <PlaceholderCard
              title="Organisation"
              description="Manage your company details, logo, and contact information."
              abbreviation="O"
              color="bg-slate-500"
            />
            <PlaceholderCard
              title="Branches"
              description="Configure branch locations, operating hours, and service areas."
              abbreviation="B"
              color="bg-indigo-500"
            />
            <PlaceholderCard
              title="Roles & Permissions"
              description="Manage user roles, access levels, and team permissions."
              abbreviation="R"
              color="bg-amber-500"
            />
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}

function PlaceholderCard({
  title,
  description,
  abbreviation,
  color,
}: {
  title: string;
  description: string;
  abbreviation: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6 opacity-75 cursor-not-allowed">
      <div className="flex items-start gap-4">
        <div
          className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center flex-shrink-0`}
        >
          <span className="text-white font-bold text-sm">{abbreviation}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500 mt-1">{description}</p>
          <span className="inline-block mt-3 text-xs text-gray-400 font-medium">Coming soon</span>
        </div>
      </div>
    </div>
  );
}
