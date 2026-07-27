'use client';

import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-white font-bold text-2xl">YG</span>
        </div>

        <h1 className="text-6xl font-bold text-gray-900">404</h1>
        <p className="mt-4 text-xl font-semibold text-gray-700">Page Not Found</p>
        <p className="mt-2 text-gray-500 max-w-md mx-auto">
          The page you are looking for does not exist or has been moved.
        </p>

        <Link
          href="/dashboard"
          className="inline-block mt-8 px-6 py-3 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
