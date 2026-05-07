import Link from 'next/link';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { useAdminWallets } from '@/lib/api/hooks/useAdminWallets';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { formatTnd } from '@/lib/utils/format';

export default function AdminWalletsPage() {
  const { data, isLoading, isError, refetch } = useAdminWallets();
  const wallets = data?.wallets ?? [];
  const summary = data?.summary;

  return (
    <AdminLayout
      activeTab="wallets"
      title="Wallet Oversight"
      subtitle="Monitor renter wallet balances and transaction activity"
    >
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        {isError && (
          <InlineError message="Failed to load wallet data." onRetry={refetch} />
        )}

        {isLoading ? (
          <LoadingCard variant="table" rows={4} columns={5} />
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl p-6 text-white shadow-lg">
                <p className="text-indigo-100 text-sm font-medium mb-1">Total Wallets</p>
                <p className="text-3xl font-bold">{summary?.walletCount ?? 0}</p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <p className="text-sm font-medium text-gray-500 mb-1">Total Balance</p>
                <p className="text-xl font-bold text-gray-900">{formatTnd(summary?.totalBalance ?? 0)}</p>
                <p className="text-[10px] text-gray-400 mt-1">Across all wallets</p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-green-500">
                <p className="text-sm font-medium text-gray-500 mb-1">Total Top-Ups</p>
                <p className="text-xl font-bold text-green-600">{formatTnd(summary?.totalTopUps ?? 0)}</p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-orange-400">
                <p className="text-sm font-medium text-gray-500 mb-1">Total Payments</p>
                <p className="text-xl font-bold text-orange-600">{formatTnd(summary?.totalPayments ?? 0)}</p>
              </div>
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-blue-400">
                <p className="text-sm font-medium text-gray-500 mb-1">Total Refunds</p>
                <p className="text-xl font-bold text-blue-600">{formatTnd(summary?.totalRefunds ?? 0)}</p>
              </div>
            </div>

            {/* Wallets Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">User Wallets</h3>
                <span className="text-sm text-gray-500">{wallets.length} wallets</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-left">
                    <tr>
                      <th className="px-6 py-3 font-medium">User</th>
                      <th className="px-6 py-3 font-medium">Email</th>
                      <th className="px-6 py-3 font-medium text-right">Balance</th>
                      <th className="px-6 py-3 font-medium text-right">Transactions</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium">Created</th>
                      <th className="px-6 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {wallets.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i className="fa-solid fa-wallet text-2xl text-gray-400" />
                          </div>
                          <p className="font-medium">No wallets created yet</p>
                          <p className="text-sm mt-1">Wallets are auto-created when users first access the wallet page.</p>
                        </td>
                      </tr>
                    ) : (
                      wallets.map((w: any) => (
                        <tr key={w.userId} className="hover:bg-gray-50 transition">
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center">
                                <span className="text-indigo-600 font-bold text-sm">
                                  {(w.user?.name || '?')[0].toUpperCase()}
                                </span>
                              </div>
                              <span className="font-medium text-gray-900">{w.user?.name || '—'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600">{w.user?.email || '—'}</td>
                          <td className="px-6 py-4 text-right">
                            <span className={`font-bold ${w.balance > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                              {formatTnd(w.balance)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right text-gray-600">{w.transactionCount}</td>
                          <td className="px-6 py-4">
                            {w.user?.suspendedAt ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                Suspended
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-gray-500 text-xs">
                            {new Date(w.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4">
                            <Link
                              href={`/admin/wallets/${w.userId}`}
                              className="text-indigo-600 hover:text-indigo-800 font-medium text-sm flex items-center"
                            >
                              View
                              <i className="fa-solid fa-arrow-right ml-1 text-xs" />
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
