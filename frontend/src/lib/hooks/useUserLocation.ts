import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { geoReverse } from '@/lib/api/geo';

// Bumped each time detection logic changes so stale labels get invalidated.
const CACHE_KEY = 'rentai_user_location_v5';
const LEGACY_CACHE_KEYS = [
  'rentai_user_location',
  'rentai_user_location_v2',
  'rentai_user_location_v3',
  'rentai_user_location_v4',
];
const CACHE_TTL_MS = 30 * 60 * 1000;
// Browser geolocation falls back to IP-based on desktops without GPS, which is
// often 10–50 km off (whole governorate wrong). Above this threshold we DISCARD
// the reading entirely and fall back to Tunis default — better to show nothing
// than to mislead the whole page with a wrong city in every section.
const ACCURACY_TRUSTED_METERS = 10000;

// Centroid of Tunis (the city). The previous value (36.8578, 11.092) was
// actually in the Cap Bon peninsula near Hammamet/Nabeul — labelling it
// "Tunis" was simply wrong and made every default-location search miss the
// capital by ~80 km.
export const TUNIS_DEFAULT = { lat: 36.8065, lng: 10.1815, cityName: 'Tunis' };

/** Clear the cached GPS-resolved location so the next render re-detects. */
export function clearLocationCache() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export interface UserLocation {
  lat: number;
  lng: number;
  cityName: string;
  loading: boolean;
  isDefault: boolean;
  permissionDenied: boolean;
  fromSavedHome: boolean;
  requestLocation: () => void;
  /** Clear the cached location and re-run GPS detection. */
  resetLocation: () => void;
}

interface Cached {
  lat: number;
  lng: number;
  cityName: string;
  ts: number;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  // zoom=10 returns city-level OSM objects (best match for "what city am I in?").
  // Higher zooms gave neighborhood names like "Medina"; lower zooms gave
  // governorate names like "Monastir" via the `county` field.
  const data = await geoReverse(lat, lng, 10);
  const addr = data?.address as any;
  // Only accept actual city/town/village fields. We deliberately do NOT fall back
  // to `suburb` (neighborhood), `county` (governorate), or `state` — those are
  // misleading at the marketplace level. "Nearby" is more honest than a wrong label.
  return (
    addr?.city ||
    addr?.town ||
    addr?.village ||
    addr?.municipality ||
    'Nearby'
  );
}

function readCache(): Cached | null {
  if (typeof window === 'undefined') return null;
  // Wipe any legacy cache keys (they held governorate-level names)
  for (const k of LEGACY_CACHE_KEYS) {
    try { localStorage.removeItem(k); } catch {}
  }
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: Cached = JSON.parse(raw);
    if (Date.now() - cached.ts > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

function clearAllLocationCache() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(CACHE_KEY); } catch {}
  for (const k of LEGACY_CACHE_KEYS) {
    try { localStorage.removeItem(k); } catch {}
  }
}

function writeCache(loc: Omit<Cached, 'ts'>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...loc, ts: Date.now() }));
  } catch {}
}

function doGetPosition(
  onSuccess: (pos: GeolocationPosition) => void,
  onError: () => void,
) {
  navigator.geolocation.getCurrentPosition(onSuccess, onError, {
    // Ask the browser to try harder (WiFi positioning where available) instead
    // of falling back to IP-based positioning straight away.
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 5 * 60 * 1000,
  });
}

export function useUserLocation(): UserLocation {
  const { user } = useAuth();
  const savedHome =
    user && typeof user.homeLat === 'number' && typeof user.homeLng === 'number'
      ? { lat: user.homeLat, lng: user.homeLng, cityName: user.homeCityName || 'Saved home' }
      : null;

  const [state, setState] = useState<Omit<UserLocation, 'requestLocation'>>({
    ...TUNIS_DEFAULT,
    loading: true,
    isDefault: true,
    permissionDenied: false,
    fromSavedHome: false,
  });

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      // No GPS — fall back to saved home or default
      if (savedHome) {
        setState({
          lat: savedHome.lat,
          lng: savedHome.lng,
          cityName: savedHome.cityName,
          loading: false,
          isDefault: false,
          permissionDenied: false,
          fromSavedHome: true,
        });
      } else {
        setState(s => ({ ...s, loading: false }));
      }
      return;
    }

    const checkAndRequest = async () => {
      let alreadyDenied = false;
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        alreadyDenied = status.state === 'denied';
      } catch {
        // Permissions API not supported — try anyway
      }

      if (alreadyDenied) {
        // GPS denied — fall back to saved home, then cache, then default
        if (savedHome) {
          setState({
            lat: savedHome.lat,
            lng: savedHome.lng,
            cityName: savedHome.cityName,
            loading: false,
            isDefault: false,
            permissionDenied: true,
            fromSavedHome: true,
          });
        } else {
          const cached = readCache();
          if (cached) {
            setState({ lat: cached.lat, lng: cached.lng, cityName: cached.cityName, loading: false, isDefault: false, permissionDenied: true, fromSavedHome: false });
          } else {
            setState(s => ({ ...s, loading: false, isDefault: true, permissionDenied: true }));
          }
        }
        return;
      }

      // Try cache first for fast initial paint, GPS will update it
      const cached = readCache();
      if (cached) {
        setState({ lat: cached.lat, lng: cached.lng, cityName: cached.cityName, loading: false, isDefault: false, permissionDenied: false, fromSavedHome: false });
      } else if (savedHome) {
        // Show saved home while GPS loads
        setState({ lat: savedHome.lat, lng: savedHome.lng, cityName: savedHome.cityName, loading: true, isDefault: false, permissionDenied: false, fromSavedHome: true });
      }

      doGetPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = pos.coords.accuracy; // meters
          const trusted = accuracy <= ACCURACY_TRUSTED_METERS;
          if (!trusted) {
            // IP-based reading (or otherwise unreliable). DISCARD entirely —
            // showing "Popular categories in Monastir" when the user isn't in
            // Monastir misleads the whole page. Fall back to Tunis default and
            // let the user pick.
            // eslint-disable-next-line no-console
            console.warn(`[useUserLocation] discarded reading (accuracy=${Math.round(accuracy)}m)`);
            setState({
              ...TUNIS_DEFAULT,
              loading: false,
              isDefault: true,
              permissionDenied: false,
              fromSavedHome: false,
            });
            return;
          }
          const cityName = await reverseGeocode(lat, lng);
          writeCache({ lat, lng, cityName });
          setState({
            lat, lng, cityName,
            loading: false,
            isDefault: false,
            permissionDenied: false,
            fromSavedHome: false,
          });
        },
        () => {
          // GPS failed — keep cache/saved home if we already set it, otherwise mark default
          setState(s => ({
            ...s,
            loading: false,
            ...(s.isDefault ? { isDefault: true, permissionDenied: true } : { permissionDenied: true }),
          }));
        },
      );
    };

    void checkAndRequest();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    setState(s => ({ ...s, loading: true, permissionDenied: false }));

    doGetPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        const trusted = accuracy <= ACCURACY_TRUSTED_METERS;
        if (!trusted) {
          // eslint-disable-next-line no-console
          console.warn(`[useUserLocation] discarded reading (accuracy=${Math.round(accuracy)}m)`);
          setState({
            ...TUNIS_DEFAULT,
            loading: false,
            isDefault: true,
            permissionDenied: false,
            fromSavedHome: false,
          });
          return;
        }
        const cityName = await reverseGeocode(lat, lng);
        writeCache({ lat, lng, cityName });
        setState({
          lat, lng, cityName,
          loading: false,
          isDefault: false,
          permissionDenied: false,
          fromSavedHome: false,
        });
      },
      () => {
        setState(s => ({ ...s, loading: false, isDefault: true, permissionDenied: true }));
      },
    );
  }, []);

  const resetLocation = useCallback(() => {
    clearAllLocationCache();
    setState({
      ...TUNIS_DEFAULT,
      loading: true,
      isDefault: true,
      permissionDenied: false,
      fromSavedHome: false,
    });
    requestLocation();
  }, [requestLocation]);

  return { ...state, requestLocation, resetLocation };
}
