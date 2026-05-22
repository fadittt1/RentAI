// Geo helpers — call the backend proxy so we can apply User-Agent + cache + rate-limit
// on the server side, instead of leaking each user's IP to Nominatim.
import { API_URL } from './env';

const API = API_URL;

export interface GeoSearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export interface GeoReverseResult {
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
  };
}

export async function geoSearch(
  query: string,
  opts: { limit?: number; countryCode?: string } = {},
): Promise<GeoSearchResult[]> {
  const qs = new URLSearchParams({ q: query });
  if (opts.limit) qs.set('limit', String(opts.limit));
  if (opts.countryCode) qs.set('countrycodes', opts.countryCode);
  const res = await fetch(`${API}/api/geo/search?${qs}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : (data?.data ?? []);
}

export async function geoReverse(
  lat: number,
  lng: number,
  zoom = 10,
): Promise<GeoReverseResult | null> {
  const qs = new URLSearchParams({ lat: String(lat), lng: String(lng), zoom: String(zoom) });
  const res = await fetch(`${API}/api/geo/reverse?${qs}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.data ?? data;
}
