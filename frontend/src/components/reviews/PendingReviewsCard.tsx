import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/http';
import { toast } from '@/components/ui/Toaster';
import { API_URL } from '@/lib/api/env';

interface PendingReview {
  bookingId: string;
  listing: { id: string; title: string; images: string[] };
  counterparty: { id: string; name: string };
  myRole: 'RENTER' | 'HOST';
}

export function PendingReviewsCard() {
  const queryClient = useQueryClient();
  const pendingQ = useQuery({
    queryKey: ['reviews', 'pending'],
    queryFn: async () => (await api.get('/reviews/me/pending')).data as PendingReview[],
  });

  const pending = pendingQ.data ?? [];
  if (pendingQ.isLoading || pending.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="mb-3 flex items-center gap-2">
        <i className="fa-solid fa-star text-amber-500" />
        <h3 className="text-base font-semibold text-amber-900">
          {pending.length} {pending.length === 1 ? 'review' : 'reviews'} waiting on you
        </h3>
      </div>
      <ul className="space-y-3">
        {pending.slice(0, 3).map((p) => (
          <PendingReviewItem
            key={p.bookingId + p.myRole}
            item={p}
            onDone={() => {
              queryClient.invalidateQueries({ queryKey: ['reviews', 'pending'] });
            }}
          />
        ))}
      </ul>
      {pending.length > 3 ? (
        <p className="mt-3 text-xs text-amber-800">
          {pending.length - 3} more after these.
        </p>
      ) : null}
    </div>
  );
}

function PendingReviewItem({
  item,
  onDone,
}: {
  item: PendingReview;
  onDone: () => void;
}) {
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const cover = item.listing.images?.[0]
    ? item.listing.images[0].startsWith('http')
      ? item.listing.images[0]
      : `${API_URL}${item.listing.images[0]}`
    : null;

  const reviewedLabel =
    item.myRole === 'RENTER'
      ? `Rate ${item.counterparty.name} and "${item.listing.title}"`
      : `Rate the renter (${item.counterparty.name})`;

  const submit = async () => {
    if (rating < 1) {
      toast({ title: 'Pick a rating', variant: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/reviews', {
        bookingId: item.bookingId,
        rating,
        comment: comment.trim() || undefined,
      });
      toast({ title: 'Thanks for your review', variant: 'success' });
      onDone();
    } catch (e: any) {
      toast({
        title: 'Could not submit review',
        message: e?.response?.data?.message ?? 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <li className="rounded-xl border border-amber-200 bg-white p-3">
      <div className="flex items-center gap-3">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={item.listing.title} className="h-12 w-12 rounded-lg object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
            <i className="fa-solid fa-image" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{reviewedLabel}</p>
          <Link
            href={`/listings/${item.listing.id}`}
            className="text-xs text-gray-500 hover:underline"
          >
            View listing
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-200"
        >
          {expanded ? 'Cancel' : 'Review'}
        </button>
      </div>

      {expanded ? (
        <div className="mt-3 space-y-3 border-t border-amber-100 pt-3">
          <StarPicker value={rating} onChange={setRating} />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              item.myRole === 'RENTER'
                ? 'How was the stay / item? (optional)'
                : 'How was the renter? (optional)'
            }
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <button
            type="button"
            onClick={submit}
            disabled={submitting || rating < 1}
            className="w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit review'}
          </button>
        </div>
      ) : null}
    </li>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          className="text-2xl leading-none transition hover:scale-110"
        >
          <i
            className={`${n <= value ? 'fa-solid' : 'fa-regular'} fa-star ${
              n <= value ? 'text-amber-500' : 'text-gray-300'
            }`}
          />
        </button>
      ))}
    </div>
  );
}
