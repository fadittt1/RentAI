import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { api } from '@/lib/api/http';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { formatTnd } from '@/lib/utils/format';

interface TopListing {
  id: string;
  title: string;
  address: string;
  pricePerDay: number | string;
  qualityScore: number;
  ratingAvg: number;
  bookingCount30d: number;
  host: { id: string; name: string };
}

interface TopHost {
  id: string;
  name: string;
  email: string | null;
  ratingAvg: number;
  ratingCount: number;
  qualityScore: number;
  verifiedEmail: boolean;
  verifiedPhone: boolean;
}

interface TopRenter {
  id: string;
  name: string;
  email: string | null;
  renterTrustScore: number;
  verifiedEmail: boolean;
  verifiedPhone: boolean;
  idVerifiedAt: string | null;
}

export default function AdminMetricsPage() {
  const listingsQ = useQuery({
    queryKey: ['admin', 'metrics', 'top-listings'],
    queryFn: async () => (await api.get('/quality/listings/top')).data as TopListing[],
  });
  const hostsQ = useQuery({
    queryKey: ['admin', 'metrics', 'top-hosts'],
    queryFn: async () => (await api.get('/quality/hosts/top')).data as TopHost[],
  });
  const rentersQ = useQuery({
    queryKey: ['admin', 'metrics', 'top-renters'],
    queryFn: async () => (await api.get('/quality/renters/top')).data as TopRenter[],
  });

  const recompute = async () => {
    try {
      await api.post('/quality/recompute');
      listingsQ.refetch();
      hostsQ.refetch();
      rentersQ.refetch();
    } catch {
      /* swallow — UI already shows errors via the queries */
    }
  };

  return (
    <AdminLayout
      activeTab="dashboard"
      title="Founder Metrics"
      subtitle="Top listings and hosts by quality score. Run the recompute after a wave of bookings or reviews."
    >
      <section className="py-6">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-6 flex items-center justify-end">
            <button
              type="button"
              onClick={recompute}
              className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
            >
              <i className="fa-solid fa-rotate mr-2" />
              Recompute all scores
            </button>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <Card title="Top listings by quality">
              {listingsQ.isLoading ? (
                <LoadingCard />
              ) : listingsQ.isError ? (
                <InlineError message="Could not load top listings." onRetry={() => listingsQ.refetch()} />
              ) : (
                <Table
                  rows={(listingsQ.data ?? []).map((l, i) => ({
                    rank: i + 1,
                    title: l.title,
                    subtitle: shortenAddress(l.address),
                    score: l.qualityScore,
                    extra: `${formatTnd(Number(l.pricePerDay))}/d · ${l.bookingCount30d} bookings/30d · ⭐ ${l.ratingAvg?.toFixed(1) ?? '—'}`,
                    href: `/listings/${l.id}`,
                  }))}
                  emptyMessage="No active listings yet."
                />
              )}
            </Card>

            <Card title="Top hosts by quality">
              {hostsQ.isLoading ? (
                <LoadingCard />
              ) : hostsQ.isError ? (
                <InlineError message="Could not load top hosts." onRetry={() => hostsQ.refetch()} />
              ) : (
                <Table
                  rows={(hostsQ.data ?? []).map((h, i) => ({
                    rank: i + 1,
                    title: h.name,
                    subtitle: h.email ?? '—',
                    score: h.qualityScore,
                    extra: `${h.ratingCount} reviews · ⭐ ${Number(h.ratingAvg).toFixed(1)}${h.verifiedEmail ? ' · ✉ verified' : ''}${h.verifiedPhone ? ' · 📞 verified' : ''}`,
                    href: `/admin/users/${h.id}`,
                  }))}
                  emptyMessage="No hosts yet."
                />
              )}
            </Card>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-2">
            <Card title="Top renters by trust">
              {rentersQ.isLoading ? (
                <LoadingCard />
              ) : rentersQ.isError ? (
                <InlineError message="Could not load top renters." onRetry={() => rentersQ.refetch()} />
              ) : (
                <Table
                  rows={(rentersQ.data ?? []).map((r, i) => ({
                    rank: i + 1,
                    title: r.name,
                    subtitle: r.email ?? '—',
                    score: r.renterTrustScore,
                    extra: `${r.verifiedEmail ? '✉ ' : ''}${r.verifiedPhone ? '📞 ' : ''}${r.idVerifiedAt ? '🪪 ' : ''}`.trim() || '—',
                    href: `/admin/users/${r.id}`,
                  }))}
                  emptyMessage="No renters yet."
                />
              )}
            </Card>
          </div>

          <ScoreLegend />
        </div>
      </section>
    </AdminLayout>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{title}</h2>
      {children}
    </div>
  );
}

interface Row {
  rank: number;
  title: string;
  subtitle: string;
  score: number;
  extra: string;
  href: string;
}

function Table({ rows, emptyMessage }: { rows: Row[]; emptyMessage: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">{emptyMessage}</p>;
  }
  return (
    <ul className="divide-y divide-gray-100">
      {rows.map((r) => (
        <li key={r.rank} className="py-3">
          <Link href={r.href} className="flex items-start justify-between gap-3 group">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-mono text-gray-400 w-6">#{r.rank}</span>
                <span className="font-medium text-gray-900 group-hover:text-blue-600 truncate">
                  {r.title}
                </span>
              </div>
              <p className="ml-8 text-xs text-gray-500 truncate">{r.subtitle}</p>
              <p className="ml-8 text-xs text-gray-400 mt-0.5">{r.extra}</p>
            </div>
            <ScoreBadge score={r.score} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 75
      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
      : score >= 50
        ? 'bg-blue-100 text-blue-700 border-blue-200'
        : score >= 25
          ? 'bg-amber-100 text-amber-700 border-amber-200'
          : 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${color}`}
    >
      {score}/100
    </span>
  );
}

function ScoreLegend() {
  return (
    <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-700">
      <h3 className="font-semibold text-gray-900 mb-2">How the score works</h3>
      <p className="mb-2">
        Quality score is 0–100 and recomputes when reviews are written, bookings
        are accepted, and nightly across the whole table.
      </p>
      <ul className="list-disc list-inside space-y-1 text-xs text-gray-600">
        <li>
          <strong>Listings</strong>: photos (12), description length (10),
          rating value (30), rating volume (15), recent bookings (20),
          slot-config bonus (5), verified host bonus (5).
        </li>
        <li>
          <strong>Hosts</strong>: verified email (5), verified phone (5),
          profile photo (5), avg listing rating (40), listing volume (20),
          recent bookings across listings (20).
        </li>
        <li>
          <strong>Renters</strong>: completed bookings (up to 20), avg rating
          from hosts (up to 30, default 15 for new renters), cancellation rate
          (penalty up to −20), late cancels (−15), host-opened disputes (−20),
          verifications (+5 each: email / phone / KYC), account age (+10).
        </li>
        <li>Suspended users and deleted listings score 0.</li>
      </ul>
    </div>
  );
}

function shortenAddress(addr: string | null | undefined): string {
  if (!addr) return '';
  const parts = addr.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.slice(-2).join(', ');
}
