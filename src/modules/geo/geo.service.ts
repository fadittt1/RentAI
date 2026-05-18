import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
// Nominatim policy requires identifying the app + contact in User-Agent.
const USER_AGENT = 'RentAI/1.0 (https://rentai.tn; contact@rentai.tn)';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 1100; // ≤1 req/sec; small headroom

interface CacheEntry {
  ts: number;
  data: unknown;
}

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private cache = new Map<string, CacheEntry>();
  private lastRequestAt = 0;

  constructor(private http: HttpService) {}

  async search(query: string, countryCode = 'tn', limit = 5): Promise<unknown> {
    const key = `search:${countryCode}:${limit}:${query.toLowerCase()}`;
    const cached = this.readCache(key);
    if (cached) return cached;

    await this.throttle();
    try {
      const { data } = await firstValueFrom(
        this.http.get(`${NOMINATIM_BASE}/search`, {
          headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
          params: {
            q: query,
            format: 'json',
            limit,
            addressdetails: 1,
            countrycodes: countryCode || undefined,
          },
        }),
      );
      this.writeCache(key, data);
      return data;
    } catch (e: any) {
      this.logger.warn(`Nominatim search failed: ${e?.message}`);
      return [];
    }
  }

  async reverse(lat: number, lng: number, zoom = 10): Promise<unknown> {
    const key = `reverse:${zoom}:${lat.toFixed(5)}:${lng.toFixed(5)}`;
    const cached = this.readCache(key);
    if (cached) return cached;

    await this.throttle();
    try {
      const { data } = await firstValueFrom(
        this.http.get(`${NOMINATIM_BASE}/reverse`, {
          headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
          params: { format: 'json', lat, lon: lng, zoom },
        }),
      );
      this.writeCache(key, data);
      return data;
    } catch (e: any) {
      this.logger.warn(`Nominatim reverse failed: ${e?.message}`);
      return null;
    }
  }

  private readCache(key: string): unknown | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private writeCache(key: string, data: unknown) {
    // Crude size cap to avoid unbounded growth
    if (this.cache.size > 2000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { ts: Date.now(), data });
  }

  private async throttle(): Promise<void> {
    const wait = Math.max(0, this.lastRequestAt + MIN_INTERVAL_MS - Date.now());
    this.lastRequestAt = Date.now() + wait;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
}
