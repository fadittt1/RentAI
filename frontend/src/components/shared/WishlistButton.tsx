import { useEffect, useState } from 'react';
import { api } from '@/lib/api/http';
import { useAuth } from '@/lib/auth/AuthProvider';
import { toast } from '@/components/ui/Toaster';

interface Props {
  listingId: string;
  /** Visual style — `circle` is for overlaying on a listing card image. */
  variant?: 'circle' | 'inline';
}

/**
 * Heart toggle. For unauthenticated users we show the button but route to
 * /auth/login on click — that preserves the "I want to save this" intent
 * for after sign-up (we attach the listing id to the next= param).
 */
export function WishlistButton({ listingId, variant = 'circle' }: Props) {
  const { user } = useAuth();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user || !listingId) {
      setSaved(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/wishlist/${listingId}/has`);
        if (!cancelled) setSaved(!!res.data?.has);
      } catch {
        if (!cancelled) setSaved(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, listingId]);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      // Send them to login, then back to the listing they wanted to save.
      window.location.href = `/auth/login?next=${encodeURIComponent(
        `/listings/${listingId}`,
      )}`;
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      if (saved) {
        await api.delete(`/wishlist/${listingId}`);
        setSaved(false);
      } else {
        await api.post(`/wishlist/${listingId}`);
        setSaved(true);
        toast({ title: 'Saved to your wishlist', variant: 'success' });
      }
    } catch {
      toast({
        title: "Couldn't update wishlist",
        message: 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const iconClass = saved
    ? 'fa-solid fa-heart text-rose-500'
    : 'fa-regular fa-heart text-slate-600';

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={submitting}
        className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
        aria-pressed={!!saved}
        aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
      >
        <i className={iconClass} aria-hidden="true" />
        {saved ? 'Saved' : 'Save'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={submitting}
      className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-md hover:scale-105 transition disabled:opacity-60"
      aria-pressed={!!saved}
      aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
    >
      <i className={iconClass} aria-hidden="true" />
    </button>
  );
}
