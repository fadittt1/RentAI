import { useEffect, useRef, useState } from 'react';
import { geoSearch, type GeoSearchResult } from '@/lib/api/geo';
import { useDebounce } from '@/lib/utils/useDebounce';

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (loc: { lat: number; lng: number; cityName: string }) => void;
}

/**
 * Modal city picker. Searches Tunisian cities via Nominatim and lets the user
 * pick one as their active session location. Used by the header chip dropdown.
 */
export function LocationCityPicker({ open, onClose, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounced = useDebounce(query, 350);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      return;
    }
    // Autofocus when the modal opens
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (debounced.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    geoSearch(debounced, { limit: 8, countryCode: 'tn' })
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => { cancelled = true; };
  }, [debounced, open]);

  if (!open) return null;

  const handlePick = (r: GeoSearchResult) => {
    const parts = r.display_name.split(', ');
    onPick({
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      cityName: parts[0] || r.display_name,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-24"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">Pick your city</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Type a Tunisian city and choose one to set your location manually.
          </p>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <i className="fa-solid fa-magnifying-glass text-slate-400 text-sm" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tunis, Sfax, Sousse, Djerba…"
              className="w-full text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            {searching && (
              <i className="fa-solid fa-spinner fa-spin text-slate-400 text-xs" />
            )}
          </div>

          <div className="mt-3 max-h-72 overflow-y-auto">
            {results.length > 0 ? (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {results.map((r) => {
                  const parts = r.display_name.split(', ');
                  const primary = parts[0];
                  const secondary = parts.slice(1, 4).join(', ');
                  return (
                    <li key={r.place_id}>
                      <button
                        type="button"
                        onClick={() => handlePick(r)}
                        className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
                      >
                        <i className="fa-solid fa-location-dot mt-0.5 shrink-0 text-blue-500 text-sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">{primary}</span>
                          <span className="block truncate text-xs text-slate-500">{secondary}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : debounced.trim().length >= 2 && !searching ? (
              <p className="px-1 py-3 text-center text-xs text-slate-500">
                No matches for "{debounced}".
              </p>
            ) : (
              <p className="px-1 py-3 text-center text-xs text-slate-400">
                Start typing to search.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
