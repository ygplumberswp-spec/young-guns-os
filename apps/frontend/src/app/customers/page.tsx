'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DashboardLayout } from '@/components/layout/dashboard-layout';

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, page],
    queryFn: () =>
      api
        .get('/customers', { params: { page, limit: 20, search: search || undefined } })
        .then((res) => res.data),
  });

  const customers = data?.data || [];
  const meta = data?.meta;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <input
            type="text"
            placeholder="Search customers..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>

        {isLoading ? (
          <LoadingSkeleton />
        ) : customers.length === 0 ? (
          <EmptyState message="No customers found" />
        ) : (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lifetime Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {customers.map((customer: any) => (
                    <tr key={customer.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {customer.firstName} {customer.lastName}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{customer.companyName || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{customer.phone || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{customer.email || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          customer.type === 'COMMERCIAL' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {customer.type || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{customer.source || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                        ${Number(customer.lifetimeValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
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
