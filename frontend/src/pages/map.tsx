import { Layout } from '@/components/layout/Layout';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useListings } from '@/lib/api/hooks/useListings';
import { useUserLocation } from '@/lib/hooks/useUserLocation';
import ListingMap from '@/components/shared/ListingMap';

const RADIUS_PRESETS = [10, 20, 30, 60, 100];

export default function MapPage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState('');
  const [radiusKm, setRadiusKm] = useState(60);

  const { lat, lng, cityName, loading: locLoading } = useUserLocation();

  // Track the map's current center — defaults to the user's location, updated on pan/zoom.
  // This is what "Search this area" uses, not the user's GPS.
  const [mapCenter, setMapCenter] = useState<[number, number]>([lat, lng]);
  // Reset map center whenever user location changes (e.g., GPS resolves after default)
  useEffect(() => { setMapCenter([lat, lng]); }, [lat, lng]);

  // Fetch ALL listings sorted by distance — no radius filter on the map.
  // The radius circle is a visual reference only; it does not hide listings.
  const { data, isLoading, isError } = useListings({
    lat,
    lng,
    limit: 200,
    sortBy: 'distance',
  });

  const listings = data?.items ?? [];

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchInput.trim()) return;
    router.push(
      `/search?q=${encodeURIComponent(searchInput.trim())}&lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`,
    );
  }

  return (
    <Layout>
      <div className="relative" style={{ height: 'calc(100vh - 73px)' }}>

        {/* ── Floating search bar ─────────────────────────── */}
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

        {/* ── Floating results count ──────────────────────── */}
        <div className="absolute right-4 top-4 z-[1000]">
          <div className="rounded-full border border-gray-200 bg-white px-4 py-2 shadow-md">
            <span className="text-sm font-semibold text-gray-900">
              {locLoading || isLoading
                ? 'Loading…'
                : isError
                ? 'Could not load listings'
                : `${listings.length} listing${listings.length !== 1 ? 's' : ''} near ${cityName}`}
            </span>
          </div>
        </div>

        {/* ── Floating radius control ─────────────────────── */}
        <div className="absolute bottom-6 left-1/2 z-[1000] -translate-x-1/2 px-4 w-full max-w-sm">
          <div className="rounded-2xl border border-gray-200 bg-white/90 px-5 py-4 shadow-xl backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Pick a radius
                </span>
                <p className="text-[10px] text-gray-400 mt-0.5">Map shows everything — slider sets the filter for "Search here"</p>
              </div>
              <span className="text-sm font-bold text-blue-600">{radiusKm} km</span>
            </div>

            {/* Slider */}
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="mb-3 w-full accent-blue-500"
            />

            {/* Preset buttons */}
            <div className="mb-3 flex gap-2">
              {RADIUS_PRESETS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRadiusKm(r)}
                  className={`flex-1 rounded-xl py-1.5 text-xs font-semibold transition ${
                    radiusKm === r
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'border border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:text-blue-600'
                  }`}
                >
                  {r} km
                </button>
              ))}
            </div>

            {/* Search-this-area button — uses the map's current center, not the user's GPS */}
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/search?lat=${mapCenter[0]}&lng=${mapCenter[1]}&radiusKm=${Math.min(radiusKm, 60)}`,
                )
              }
              className="w-full rounded-xl bg-blue-500 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600"
            >
              <i className="fa-solid fa-magnifying-glass mr-2" />
              Search this area
            </button>
          </div>
        </div>

        {/* ── Map ────────────────────────────────────────── */}
        <ListingMap
          listings={listings}
          center={[lat, lng]}
          zoom={11}
          height="100%"
          userLocation={[lat, lng]}
          radiusKm={radiusKm}
          onMoveEnd={(c) => setMapCenter(c)}
        />
      </div>
    </Layout>
  );
}
