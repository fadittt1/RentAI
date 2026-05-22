import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/auth/AuthProvider';

const STORAGE_KEY = 'rentai:host-mode';

type Mode = 'rent' | 'host';

/**
 * Tracks whether a host is currently viewing the app in "Host mode" (managing
 * their listings + bookings) or "Renter mode" (browsing & booking).
 *
 * - Non-hosts are always "rent" mode and cannot toggle.
 * - For hosts: persists to localStorage; defaults to "rent" unless the user is
 *   currently on a /host/* route, in which case "host".
 */
export function useHostMode() {
  const router = useRouter();
  const { user } = useAuth();
  const isHost = Boolean(user?.isHost);

  const [mode, setModeState] = useState<Mode>('rent');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'host' && isHost) {
        setModeState('host');
      } else if (stored === 'rent') {
        setModeState('rent');
      } else if (isHost && router.pathname.startsWith('/host')) {
        // First-visit default: if landing on a /host page, assume host mode.
        setModeState('host');
      } else {
        setModeState('rent');
      }
    } catch {
      /* ignore */
    } finally {
      setHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost]);

  const setMode = useCallback(
    (next: Mode) => {
      if (next === 'host' && !isHost) return;
      setModeState(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
    },
    [isHost],
  );

  const toggle = useCallback(() => {
    setMode(mode === 'host' ? 'rent' : 'host');
  }, [mode, setMode]);

  return {
    mode,
    setMode,
    toggle,
    isHost,
    hydrated,
    canSwitch: isHost,
  };
}
