import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { api } from '@/lib/api/http';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatTnd } from '@/lib/utils/format';
import { toast } from '@/components/ui/Toaster';

interface QueueRow {
  id: string;
  status: 'OPEN' | 'RESOLVED' | 'NONE';
  reason: string;
  openedBy: 'RENTER' | 'HOST';
  createdAt: string;
  booking: {
    id: string;
    totalPrice: number | string;
    listing: { id: string; title: string };
    renter: { id: string; name: string };
    host: { id: string; name: string };
  };
  _count: { messages: number };
}

type Resolution = 'REFUND_FULL' | 'REFUND_PARTIAL' | 'FAVOR_HOST' | 'DISMISSED';

export default function AdminDisputesPage() {
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const q = useQuery({
    queryKey: ['admin', 'disputes', status],
    queryFn: async () =>
      (await api.get(`/disputes/admin/queue?status=${status}`)).data as QueueRow[],
  });

  return (
    <AdminLayout
      activeTab="dashboard"
      title="Disputes"
      subtitle="Reported issues between renters and hosts. Open disputes hold the host payout."
    >
      <section className="py-6">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-6 inline-flex rounded-full border border-gray-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setStatus('OPEN')}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                status === 'OPEN' ? 'bg-amber-500 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Open
            </button>
            <button
              type="button"
              onClick={() => setStatus('RESOLVED')}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                status === 'RESOLVED' ? 'bg-emerald-500 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Resolved
            </button>
          </div>

          {q.isLoading ? (
            <LoadingCard />
          ) : q.isError ? (
            <InlineError message="Could not load disputes." onRetry={() => q.refetch()} />
          ) : (q.data ?? []).length === 0 ? (
            <EmptyState
              icon="fa-solid fa-shield-halved"
              title={status === 'OPEN' ? 'No open disputes' : 'No resolved disputes yet'}
              message=""
            />
          ) : (
            <div className="space-y-4">
              {(q.data ?? []).map((row) => (
                <AdminDisputeRow key={row.id} row={row} onResolved={() => q.refetch()} />
              ))}
            </div>
          )}
        </div>
      </section>
    </AdminLayout>
  );
}

function AdminDisputeRow({
  row,
  onResolved,
}: {
  row: QueueRow;
  onResolved: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [resolution, setResolution] = useState<Resolution>('REFUND_FULL');
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const total = Number(row.booking.totalPrice);

  const resolve = async () => {
    setSubmitting(true);
    try {
      await api.post(`/disputes/${row.id}/resolve`, {
        resolution,
        refundAmount:
          resolution === 'REFUND_PARTIAL'
            ? Number(refundAmount || 0)
            : undefined,
        notes: notes.trim() || undefined,
      });
      toast({ title: 'Dispute resolved', variant: 'success' });
      setPickerOpen(false);
      onResolved();
    } catch (e: any) {
      toast({
        title: 'Resolve failed',
        message: e?.response?.data?.message ?? 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/disputes/${row.id}`}
            className="text-sm font-semibold text-gray-900 hover:underline truncate block"
          >
            {row.booking.listing.title}
          </Link>
          <p className="mt-1 text-xs text-gray-500">
            {row.reason.replace('_', ' ').toLowerCase()} · opened by{' '}
            {row.openedBy.toLowerCase()} · {new Date(row.createdAt).toLocaleString()} ·{' '}
            {row._count.messages} message{row._count.messages === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Renter <strong>{row.booking.renter.name}</strong> vs host{' '}
            <strong>{row.booking.host.name}</strong> · {formatTnd(total)} at stake
          </p>
        </div>

        {row.status === 'OPEN' && !pickerOpen ? (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="shrink-0 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
          >
            Resolve
          </button>
        ) : null}
      </div>

      {pickerOpen ? (
        <div className="mt-4 grid gap-3 border-t border-gray-200 pt-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(['REFUND_FULL', 'REFUND_PARTIAL', 'FAVOR_HOST', 'DISMISSED'] as Resolution[]).map(
              (r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setResolution(r)}
                  className={`rounded-xl border-2 px-3 py-2 text-xs font-semibold transition ${
                    resolution === r
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {r.replace('_', ' ')}
                </button>
              ),
            )}
          </div>

          {resolution === 'REFUND_PARTIAL' ? (
            <div>
              <label className="text-xs font-semibold text-gray-700">Refund amount (TND)</label>
              <input
                type="number"
                min={0}
                max={total}
                step="0.5"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="mt-1 w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Max {formatTnd(total)}. Partial refunds are recorded — wire the cash
                movement manually for now.
              </p>
            </div>
          ) : null}

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Notes shown to both parties (what you decided and why)"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={resolve}
              disabled={submitting}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
            >
              {submitting ? 'Resolving…' : 'Confirm resolution'}
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
