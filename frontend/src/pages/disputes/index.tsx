import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { api } from '@/lib/api/http';
import { useAuth } from '@/lib/auth/AuthProvider';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatTnd } from '@/lib/utils/format';

interface DisputeListItem {
  id: string;
  status: 'OPEN' | 'RESOLVED' | 'NONE';
  resolution:
    | 'PENDING'
    | 'REFUND_FULL'
    | 'REFUND_PARTIAL'
    | 'FAVOR_HOST'
    | 'DISMISSED';
  reason: string;
  openedBy: 'RENTER' | 'HOST';
  createdAt: string;
  resolvedAt: string | null;
  booking: {
    id: string;
    totalPrice: number | string;
    renterId: string;
    hostId: string;
    listing: { id: string; title: string; images: string[] };
  };
}

export default function MyDisputesPage() {
  const { user, authReady } = useAuth();
  const q = useQuery({
    queryKey: ['disputes', 'me'],
    enabled: !!user,
    queryFn: async () => (await api.get('/disputes/me')).data as DisputeListItem[],
  });

  if (authReady && !user) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Sign in to see your disputes</h1>
          <Link
            href="/auth/login?next=/disputes"
            className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-600"
          >
            Sign in
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-900">Disputes</h1>
        <p className="mt-1 text-slate-600">
          Issues you've reported as renter or host. Open disputes hold the host
          payout until resolved.
        </p>

        <div className="mt-8 space-y-3">
          {q.isLoading ? (
            <LoadingCard />
          ) : q.isError ? (
            <InlineError message="Could not load your disputes." onRetry={() => q.refetch()} />
          ) : (q.data ?? []).length === 0 ? (
            <EmptyState
              icon="fa-solid fa-shield-halved"
              title="No disputes"
              message="You haven't reported any issues. From a paid booking you can use 'Report issue'."
              cta={{ label: 'My bookings', href: '/rentals' }}
            />
          ) : (
            (q.data ?? []).map((d) => (
              <DisputeRow key={d.id} dispute={d} myUserId={user?.id ?? ''} />
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}

function DisputeRow({
  dispute,
  myUserId,
}: {
  dispute: DisputeListItem;
  myUserId: string;
}) {
  const role =
    dispute.booking.renterId === myUserId ? 'You (renter)' : 'You (host)';
  const statusBadge =
    dispute.status === 'RESOLVED' ? (
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        Resolved · {dispute.resolution.replace('_', ' ')}
      </span>
    ) : (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
        Open
      </span>
    );

  return (
    <Link
      href={`/disputes/${dispute.id}`}
      className="block rounded-2xl border border-gray-200 bg-white p-5 transition hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-gray-900 truncate">
              {dispute.booking.listing.title}
            </span>
            {statusBadge}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {role} · {dispute.reason.replace('_', ' ').toLowerCase()} ·{' '}
            {new Date(dispute.createdAt).toLocaleDateString()}
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-gray-900">
          {formatTnd(Number(dispute.booking.totalPrice))}
        </span>
      </div>
    </Link>
  );
}
