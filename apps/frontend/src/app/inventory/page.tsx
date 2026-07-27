'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DashboardLayout } from '@/components/layout/dashboard-layout';

export default function InventoryPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', search, page],
    queryFn: () =>
      api
        .get('/inventory', { params: { page, limit: 20, search: search || undefined } })
        .then((res) => res.data),
  });

  const items = data?.data || [];
  const meta = data?.meta;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <div className="w-72">
            <input
              type="text"
              placeholder="Search by name or SKU..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-colors"
            />
          </div>
        </div>

        {isLoading ? (
          <LoadingSkeleton />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost Price</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sell Price</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {items.map((item: any) => {
                      const isBelowMin =
                        item.minStockLevel != null && item.quantity < item.minStockLevel;
                      return (
                        <tr
                          key={item.id}
                          className={isBelowMin ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}
                        >
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.sku}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">{item.name}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{item.category || '-'}</td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            <span className={isBelowMin ? 'text-red-700 font-medium' : ''}>
                              {item.quantity}
                            </span>
                            {isBelowMin && (
                              <span className="ml-2 text-xs text-red-500">(min: {item.minStockLevel})</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {item.costPrice != null ? `$${Number(item.costPrice).toFixed(2)}` : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {item.sellPrice != null ? `$${Number(item.sellPrice).toFixed(2)}` : '-'}
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge status={item.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    INACTIVE: 'bg-gray-100 text-gray-800',
    DISCONTINUED: 'bg-red-100 text-red-800',
  };
  return (
    <span
      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${colors[status] || 'bg-gray-100 text-gray-800'}`}
    >
      {status?.replace(/_/g, ' ')}
    </span>
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
      <p className="text-gray-500">No inventory items found</p>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-gray-600">
        Page {page} of {totalPages}
      </p>
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
