import { Layout } from '@/components/layout/Layout';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useListings } from '@/lib/api/hooks/useListings';
import ListingMap from '@/components/shared/ListingMap';

const DEFAULT_LAT = 36.8578;
const DEFAULT_LNG = 11.092;
const DEFAULT_RADIUS = 20;

export default function MapPage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading, isError } = useListings({
    lat: DEFAULT_LAT,
    lng: DEFAULT_LNG,
    radiusKm: DEFAULT_RADIUS,
    limit: 50,
    sortBy: 'distance',
  });

  const listings = data?.items ?? [];

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchInput.trim()) return;
    router.push(`/search?q=${encodeURIComponent(searchInput.trim())}`);
  }

  return (
    <Layout>
      <div className="relative" style={{ height: 'calc(100vh - 73px)' }}>
        {/* Floating search bar */}
        <div className="absolute left-1/2 top-4 z-[1000] w-full max-w-lg -translate-x-1/2 px-4">
          <form
            onSubmit={handleSearch}
            className="flex overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
          >
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="What do you want to rent?"
              className="flex-1 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
            />
            <button
              type="submit"
              className="flex items-center justify-center bg-blue-500 px-5 text-white transition hover:bg-blue-600"
            >
              <i className="fa-solid fa-search" />
            </button>
          </form>
        </div>

        {/* Floating results count */}
        <div className="absolute right-4 top-4 z-[1000]">
          <div className="rounded-full border border-gray-200 bg-white px-4 py-2 shadow-md">
            <span className="text-sm font-semibold text-gray-900">
              {isLoading
                ? 'Loading…'
                : isError
                ? 'Could not load listings'
                : `${listings.length} listing${listings.length !== 1 ? 's' : ''} nearby`}
            </span>
          </div>
        </div>

        {/* Real Leaflet map */}
        <ListingMap
          listings={listings}
          center={[DEFAULT_LAT, DEFAULT_LNG]}
          zoom={12}
          height="100%"
        />
      </div>
    </Layout>
  );
}
