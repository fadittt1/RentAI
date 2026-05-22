import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { api } from '@/lib/api/http';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { WishlistButton } from '@/components/shared/WishlistButton';
import { formatTnd } from '@/lib/utils/format';
import { API_URL } from '@/lib/api/env';
import { useUserLocation } from '@/lib/hooks/useUserLocation';

interface Deal {
  id: string;
  title: string;
  description: string;
  address: string;
  images: string[];
  pricePerDay: number;
  ratingAvg: number;
  ratingCount: number;
  qualityScore: number;
  bookingType: 'DAILY' | 'SLOT';
  freeNights: number;
  distanceKm: number | null;
}

export default function LastMinutePage() {
  const userLocation = useUserLocation();
  const [useGeo, setUseGeo] = useState<boolean>(true);

  // Skip the location filter while geolocation is still resolving — otherwise
  // we'd fire a "near me" query with the fallback Tunis coords and surface
  // results that aren't actually nearby.
  const hasResolvedGeo = !userLocation.loading && !userLocation.isDefault;
  const lat = useGeo && hasResolvedGeo ? userLocation.lat : null;
  const lng = useGeo && hasResolvedGeo ? userLocation.lng : null;

  const dealsQ = useQuery({
    queryKey: ['last-minute', lat, lng],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (lat != null && lng != null) {
        params.set('lat', String(lat));
        params.set('lng', String(lng));
        params.set('radiusKm', '50');
      }
      const res = await api.get(`/listings/last-minute?${params.toString()}`);
      return res.data as Deal[];
    },
  });

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              <i className="fa-solid fa-bolt text-amber-500 mr-2" />
              Last-minute deals
            </h1>
            <p className="mt-1 text-slate-600">
              High-quality listings with open availability in the next 7 days.
              Updated continuously.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setUseGeo((v) => !v)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                useGeo
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <i className="fa-solid fa-location-crosshairs mr-1" />
              {useGeo ? 'Near me' : 'All Tunisia'}
            </button>
          </div>
        </div>

        <div className="mt-8">
          {dealsQ.isLoading ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              <LoadingCard />
              <LoadingCard />
              <LoadingCard />
            </div>
          ) : dealsQ.isError ? (
            <InlineError
              message="Could not load deals."
              onRetry={() => dealsQ.refetch()}
            />
          ) : (dealsQ.data ?? []).length === 0 ? (
            <EmptyState
              icon="fa-solid fa-bolt"
              title="No deals right now"
              message={
                useGeo
                  ? 'Nothing nearby with open availability. Try widening to all of Tunisia.'
                  : 'No qualifying deals at the moment. Check back tomorrow.'
              }
              cta={{ label: 'Browse all listings', href: '/search' }}
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {(dealsQ.data ?? []).map((deal) => (
                <DealCard key={deal.id} deal={deal} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function DealCard({ deal }: { deal: Deal }) {
  const cover = deal.images?.[0]
    ? deal.images[0].startsWith('http')
      ? deal.images[0]
      : `${API_URL}${deal.images[0]}`
    : null;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
      <WishlistButton listingId={deal.id} />
      <Link href={`/listings/${deal.id}`}>
        <div className="relative h-48 w-full overflow-hidden bg-gray-100">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={deal.title}
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-400">
              <i className="fa-solid fa-image text-3xl" />
            </div>
          )}
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white shadow">
            <i className="fa-solid fa-bolt" />
            {deal.freeNights} free night{deal.freeNights === 1 ? '' : 's'}
          </span>
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 font-semibold text-gray-900">
              {deal.title}
            </h3>
            {deal.qualityScore >= 75 ? (
              <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                Top
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-gray-500">{deal.address}</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">
              {formatTnd(deal.pricePerDay)}
              <span className="text-xs font-normal text-gray-500"> / day</span>
            </span>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              {deal.distanceKm != null ? (
                <span>{deal.distanceKm.toFixed(1)} km</span>
              ) : null}
              {deal.ratingAvg > 0 ? (
                <span>⭐ {deal.ratingAvg.toFixed(1)}</span>
              ) : null}
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
