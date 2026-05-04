import React, { useState } from 'react';
import Link from 'next/link';
import { ClientLayout } from '@/components/client/ClientLayout';
import { useWallet, useTopUpWallet } from '@/lib/api/hooks/useWallet';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { formatTnd } from '@/lib/utils/format';

export default function WalletPage() {
  const { data: wallet, isLoading, isError, refetch } = useWallet();
  const topUpMutation = useTopUpWallet();
  const [topUpAmount, setTopUpAmount] = useState<string>('50');
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [topUpSuccess, setTopUpSuccess] = useState(false);

  const handleTopUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount <= 0) {
      setTopUpError('Please enter a valid positive amount.');
      return;
    }

    setTopUpError(null);
    setTopUpSuccess(false);

    try {
      await topUpMutation.mutateAsync({ amount });
      setTopUpAmount('');
      setTopUpSuccess(true);
      setTimeout(() => setTopUpSuccess(false), 4000);
    } catch (error: any) {
      const msg =
        error?.body?.message ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to top up wallet. Please try again.';
      setTopUpError(typeof msg === 'string' ? msg : 'Failed to top up wallet.');
    }
  };

  if (isLoading) {
    return (
      <ClientLayout>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <LoadingCard />
        </div>
      </ClientLayout>
    );
  }

  if (isError) {
    return (
      <ClientLayout>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="bg-red-50 text-red-700 p-6 rounded-xl border border-red-200 flex items-start justify-between">
            <div className="flex items-center">
              <i className="fa-solid fa-triangle-exclamation mr-3 text-red-500" />
              <div>
                <p className="font-semibold">Could not load your wallet</p>
                <p className="text-sm text-red-600 mt-1">Please check your connection and try again.</p>
              </div>
            </div>
            <button
              onClick={() => void refetch()}
              className="ml-4 text-sm text-red-600 underline hover:text-red-800 transition whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Wallet</h1>
          <Link
            href="/client/dashboard"
            className="text-sm text-gray-500 hover:text-gray-900 transition flex items-center"
          >
            <i className="fa-solid fa-arrow-left mr-2" />
            Back to Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Balance Card */}
          <div className="md:col-span-1 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
            <h2 className="text-indigo-100 text-sm font-medium mb-1">Available Balance</h2>
            <div className="text-4xl font-bold mb-4">
              {formatTnd(wallet?.balance || 0)}
            </div>
            <div className="text-indigo-100 text-sm flex items-center">
              <i className="fa-solid fa-circle-check mr-2" />
              Ready to use for bookings
            </div>
          </div>

          {/* Top-up form (MVP dev only) */}
          <div className="md:col-span-2 bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Simulate Top-Up</h3>
            <p className="text-gray-500 text-sm mb-4">
              For MVP purposes, you can simulate adding funds to your wallet here. In production, this will connect to a real payment gateway.
            </p>

            {topUpError && (
              <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200 flex items-center">
                <i className="fa-solid fa-circle-exclamation mr-2 text-red-500" />
                {topUpError}
              </div>
            )}

            {topUpSuccess && (
              <div className="mb-4 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg border border-green-200 flex items-center">
                <i className="fa-solid fa-circle-check mr-2 text-green-500" />
                Funds added successfully!
              </div>
            )}

            <form onSubmit={handleTopUp} className="flex gap-4">
              <div className="flex-1 relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">TND</span>
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={topUpAmount}
                  onChange={(e) => { setTopUpAmount(e.target.value); setTopUpError(null); }}
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition"
                  placeholder="Amount"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={topUpMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-6 py-3 rounded-xl shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {topUpMutation.isPending ? (
                  <i className="fa-solid fa-circle-notch fa-spin mr-2" />
                ) : (
                  <i className="fa-solid fa-plus mr-2" />
                )}
                Add Funds
              </button>
            </form>
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">Transaction History</h3>
            <span className="text-sm text-gray-500">
              {wallet?.transactions?.length ?? 0} transactions
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {(!wallet?.transactions || wallet.transactions.length === 0) ? (
              <div className="p-8 text-center text-gray-500">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fa-solid fa-receipt text-2xl text-gray-400" />
                </div>
                <p className="font-medium">No transactions yet</p>
                <p className="text-sm mt-1">Top up your wallet to get started.</p>
              </div>
            ) : (
              wallet.transactions.map((tx: any) => (
                <div key={tx.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition">
                  <div className="flex items-center space-x-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      tx.type === 'TOP_UP' ? 'bg-green-100 text-green-600' :
                      tx.type === 'REFUND' ? 'bg-blue-100 text-blue-600' :
                      'bg-orange-100 text-orange-600'
                    }`}>
                      <i className={`fa-solid ${
                        tx.type === 'TOP_UP' ? 'fa-arrow-down' :
                        tx.type === 'REFUND' ? 'fa-arrow-rotate-left' :
                        'fa-arrow-up'
                      }`} />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">
                        {tx.type === 'TOP_UP' ? 'Wallet Top-Up' :
                         tx.type === 'REFUND' ? 'Booking Refund' :
                         'Booking Payment'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(tx.createdAt).toLocaleDateString()} at {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {tx.referenceId && ` • Ref: ${tx.referenceId.slice(0, 8)}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${
                      ['TOP_UP', 'REFUND'].includes(tx.type) ? 'text-green-600' : 'text-gray-900'
                    }`}>
                      {['TOP_UP', 'REFUND'].includes(tx.type) ? '+' : '-'}{formatTnd(tx.amount)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Balance: {formatTnd(tx.balanceAfter)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}


