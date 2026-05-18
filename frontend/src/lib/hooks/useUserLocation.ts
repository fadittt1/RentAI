import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { geoReverse } from '@/lib/api/geo';

const CACHE_KEY = 'rentai_user_location';
const CACHE_TTL_MS = 30 * 60 * 1000;

export const TUNIS_DEFAULT = { lat: 36.8578, lng: 11.092, cityName: 'Tunis' };

export interface UserLocation {
  lat: number;
  lng: number;
  cityName: string;
  loading: boolean;
  isDefault: boolean;
  permissionDenied: boolean;
  fromSavedHome: boolean;
  requestLocation: () => void;
}

interface Cached {
  lat: number;
  lng: number;
  cityName: string;
  ts: number;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const data = await geoReverse(lat, lng, 10);
  return (
    data?.address?.city ||
    data?.address?.town ||
    data?.address?.village ||
    data?.address?.county ||
    'Nearby'
  );
}

function readCache(): Cached | null {
  if (typeof window === 'undefined') return null;
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
    timeout: 10000,
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

  // Sync immediately when a logged-in user's saved home becomes available
  useEffect(() => {
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
    }
  }, [savedHome?.lat, savedHome?.lng, savedHome?.cityName]);

  useEffect(() => {
    // Saved home wins over everything — no detection needed
    if (savedHome) return;

    const cached = readCache();
    if (cached) {
      setState({
        lat: cached.lat,
        lng: cached.lng,
        cityName: cached.cityName,
        loading: false,
        isDefault: false,
        permissionDenied: false,
        fromSavedHome: false,
      });
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState(s => ({ ...s, loading: false }));
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
        setState(s => ({ ...s, loading: false, isDefault: true, permissionDenied: true }));
        return;
      }

      doGetPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const cityName = await reverseGeocode(lat, lng);
          writeCache({ lat, lng, cityName });
          setState({ lat, lng, cityName, loading: false, isDefault: false, permissionDenied: false, fromSavedHome: false });
        },
        () => {
          setState(s => ({ ...s, loading: false, isDefault: true, permissionDenied: true }));
        },
      );
    };

    void checkAndRequest();
  }, [savedHome?.lat, savedHome?.lng]);

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    setState(s => ({ ...s, loading: true, permissionDenied: false }));

    doGetPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const cityName = await reverseGeocode(lat, lng);
        writeCache({ lat, lng, cityName });
        setState({ lat, lng, cityName, loading: false, isDefault: false, permissionDenied: false, fromSavedHome: false });
      },
      () => {
        setState(s => ({ ...s, loading: false, isDefault: true, permissionDenied: true }));
      },
    );
  }, []);

  return { ...state, requestLocation };
}
