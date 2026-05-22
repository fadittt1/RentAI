import { useEffect, useRef, useState } from 'react';
import { useDebounce } from '@/lib/utils/useDebounce';
import { geoSearch, type GeoSearchResult } from '@/lib/api/geo';

export interface PickedCity {
  cityName: string;
  lat: number;
  lng: number;
}

type PlaceSuggestion = GeoSearchResult;

interface CityPickerProps {
  value: string;
  onChange: (newValue: string) => void;
  onPick: (city: PickedCity) => void;
  placeholder?: string;
  /** Show the small GPS/location icon on the left side. */
  leadingIcon?: React.ReactNode;
  /** Optional clear-button when a city has been picked. */
  showClear?: boolean;
  onClear?: () => void;
  /** Tailwind classes for the input wrapper. */
  className?: string;
  /** Bias suggestions to a country (default Tunisia). */
  countryCode?: string;
  disabled?: boolean;
  inputClassName?: string;
}

export function CityPicker({
  value,
  onChange,
  onPick,
  placeholder = 'City or area',
  leadingIcon,
  showClear = false,
  onClear,
  className = '',
  countryCode = 'tn',
  disabled = false,
  inputClassName = '',
}: CityPickerProps) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [show, setShow] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debouncedValue = useDebounce(value, 350);
  const [lastPickedValue, setLastPickedValue] = useState<string | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShow(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    // If user just picked a suggestion, skip refetch
    if (debouncedValue.length < 2 || debouncedValue === lastPickedValue) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    geoSearch(debouncedValue, { limit: 5, countryCode: countryCode || undefined })
      .then((data) => {
        if (!cancelled) {
          setSuggestions(data);
          setShow(data.length > 0);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [debouncedValue, lastPickedValue, countryCode]);

  function handlePick(s: PlaceSuggestion) {
    const parts = s.display_name.split(', ');
    const primary = parts[0];
    const lat = parseFloat(s.lat);
    const lng = parseFloat(s.lon);
    setLastPickedValue(primary);
    onChange(primary);
    onPick({ cityName: primary, lat, lng });
    setSuggestions([]);
    setShow(false);
  }

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <div className="flex items-center gap-2">
        {leadingIcon}
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setLastPickedValue(null);
          }}
          onFocus={() => { if (suggestions.length > 0) setShow(true); }}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:bg-transparent ${inputClassName}`}
        />
        {showClear && value && (
          <button
            type="button"
            onClick={() => { onChange(''); setLastPickedValue(null); onClear?.(); }}
            className="shrink-0 text-gray-400 hover:text-gray-600"
            aria-label="Clear"
          >
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        )}
      </div>

      {show && suggestions.length > 0 && (
        <ul className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          {suggestions.map((s) => {
            const parts = s.display_name.split(', ');
            const primary = parts[0];
            const secondary = parts.slice(1).join(', ');
            return (
              <li
                key={s.place_id}
                onMouseDown={(e) => { e.preventDefault(); handlePick(s); }}
                className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-gray-50"
              >
                <i className="fa-solid fa-location-dot mt-0.5 shrink-0 text-gray-400 text-sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-900">{primary}</span>
                  <span className="block truncate text-xs text-gray-400">{secondary}</span>
                </span>
              </li>
            );
          })}
          <li className="border-t border-gray-100 px-4 py-1.5 text-[10px] text-gray-400">
            © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap</a> contributors
          </li>
        </ul>
      )}
    </div>
  );
}
