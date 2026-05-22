import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { api } from '@/lib/api/http';
import { useAuth } from '@/lib/auth/AuthProvider';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { WishlistButton } from '@/components/shared/WishlistButton';
import { formatTnd } from '@/lib/utils/format';
import { API_URL } from '@/lib/api/env';

interface SavedListing {
  id: string;
  title: string;
  images: string[];
  address: string;
  pricePerDay: number | string;
  ratingAvg: number;
  qualityScore: number;
}

export default function WishlistPage() {
  const { user, authReady } = useAuth();
  const query = useQuery({
    queryKey: ['wishlist'],
    enabled: !!user,
    queryFn: async () => (await api.get('/wishlist')).data as SavedListing[],
  });

  if (authReady && !user) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Sign in to see your wishlist</h1>
          <p className="mt-2 text-slate-600">
            We'll keep your saved listings here so you can come back to them.
          </p>
          <Link
            href="/auth/login?next=/wishlist"
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
      <div className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-900">Your wishlist</h1>
        <p className="mt-1 text-slate-600">
          Listings you've saved. Tap the heart on any listing to add or remove.
        </p>

        <div className="mt-8">
          {query.isLoading ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
            </div>
          ) : query.isError ? (
            <InlineError
              message="Could not load your wishlist."
              onRetry={() => query.refetch()}
            />
          ) : (query.data ?? []).length === 0 ? (
            <EmptyState
              icon="fa-regular fa-heart"
              title="No saved listings yet"
              message="Browse and tap the heart on anything you like — we'll keep it here."
              cta={{ label: 'Browse listings', href: '/search' }}
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {(query.data ?? []).map((l) => (
                <WishCard key={l.id} listing={l} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function WishCard({ listing }: { listing: SavedListing }) {
  const cover = listing.images?.[0]
    ? listing.images[0].startsWith('http')
      ? listing.images[0]
      : `${API_URL}${listing.images[0]}`
    : null;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
      <WishlistButton listingId={listing.id} />
      <Link href={`/listings/${listing.id}`}>
        <div className="relative h-48 w-full overflow-hidden bg-gray-100">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={listing.title}
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-400">
              <i className="fa-solid fa-image text-3xl" />
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 font-semibold text-gray-900">
              {listing.title}
            </h3>
            {listing.qualityScore >= 75 ? (
              <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                Top
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-gray-500">{listing.address}</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">
              {formatTnd(Number(listing.pricePerDay))}
              <span className="text-xs font-normal text-gray-500"> / day</span>
            </span>
            {Number(listing.ratingAvg) > 0 ? (
              <span className="text-xs text-gray-600">
                ⭐ {Number(listing.ratingAvg).toFixed(1)}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </div>
  );
}
