import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { api } from '@/lib/api/http';
import { useAuth } from '@/lib/auth/AuthProvider';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/Toaster';

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

type Filter = 'all' | 'unread';

const KIND_LABEL: Record<string, string> = {
  BOOKING_REQUESTED: 'Booking',
  BOOKING_ACCEPTED: 'Booking',
  BOOKING_REJECTED: 'Booking',
  BOOKING_PAID: 'Payment',
  BOOKING_CANCELLED: 'Booking',
  BOOKING_COMPLETED: 'Booking',
  REVIEW_RECEIVED: 'Review',
  DISPUTE_OPENED: 'Dispute',
  DISPUTE_RESOLVED: 'Dispute',
  DISPUTE_MESSAGE: 'Dispute',
  KYC_APPROVED: 'Verification',
  KYC_REJECTED: 'Verification',
  PAYOUT_PAID: 'Payout',
};

export default function NotificationsPage() {
  const { user, authReady } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');

  const q = useQuery({
    queryKey: ['notifications', 'page', filter],
    enabled: !!user,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (filter === 'unread') params.set('unread', '1');
      const res = await api.get(`/notifications?${params.toString()}`);
      return res.data as NotificationItem[];
    },
  });

  const markAllRead = async () => {
    try {
      const res = await api.post('/notifications/read-all');
      const count = res.data?.count ?? 0;
      toast({
        title: count > 0 ? `${count} marked read` : 'Nothing to mark',
        variant: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch {
      toast({
        title: 'Could not mark all read',
        message: 'Please try again.',
        variant: 'error',
      });
    }
  };

  if (authReady && !user) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Sign in to see your notifications</h1>
          <Link
            href="/auth/login?next=/notifications"
            className="mt-6 inline-block rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-600"
          >
            Sign in
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
            <p className="mt-1 text-sm text-slate-600">
              Everything that happened on your bookings, reviews, disputes, and verifications.
            </p>
          </div>
          <button
            type="button"
            onClick={markAllRead}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Mark all read
          </button>
        </div>

        <div className="mt-6 inline-flex rounded-full border border-gray-200 bg-white p-1">
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </FilterPill>
          <FilterPill active={filter === 'unread'} onClick={() => setFilter('unread')}>
            Unread
          </FilterPill>
        </div>

        <div className="mt-6">
          {q.isLoading ? (
            <LoadingCard />
          ) : q.isError ? (
            <InlineError message="Could not load notifications." onRetry={() => q.refetch()} />
          ) : (q.data ?? []).length === 0 ? (
            <EmptyState
              icon="fa-regular fa-bell-slash"
              title={filter === 'unread' ? "You're all caught up" : 'No notifications yet'}
              message={
                filter === 'unread'
                  ? 'Switch to "All" to see your history.'
                  : "You'll see booking requests, reviews, and verification updates here."
              }
            />
          ) : (
            <ul className="divide-y divide-gray-200 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              {(q.data ?? []).map((n) => (
                <Row key={n.id} n={n} onRead={() => queryClient.invalidateQueries({ queryKey: ['notifications'] })} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
        active ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}

function Row({
  n,
  onRead,
}: {
  n: NotificationItem;
  onRead: () => void;
}) {
  const handleClick = async () => {
    if (!n.readAt) {
      try {
        await api.post(`/notifications/${n.id}/read`);
        onRead();
      } catch {
        /* swallow — link nav still proceeds */
      }
    }
  };

  const icon = kindIcon(n.kind);
  const tag = KIND_LABEL[n.kind] ?? 'Update';

  const body = (
    <div className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50">
      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${icon.bg}`}>
        <i className={`${icon.icon} ${icon.color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            {tag}
          </span>
          <span className="text-xs text-gray-500">{new Date(n.createdAt).toLocaleString()}</span>
        </div>
        <p className={`mt-1 ${n.readAt ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
          {n.title}
        </p>
        {n.body ? <p className="mt-1 text-sm text-gray-600">{n.body}</p> : null}
      </div>
      {!n.readAt ? (
        <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
      ) : null}
    </div>
  );

  if (n.link) {
    return (
      <li>
        <Link href={n.link} onClick={handleClick} className="block">
          {body}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <button type="button" onClick={handleClick} className="block w-full text-left">
        {body}
      </button>
    </li>
  );
}

function kindIcon(kind: string): { icon: string; color: string; bg: string } {
  const map: Record<string, { icon: string; color: string; bg: string }> = {
    BOOKING_REQUESTED: { icon: 'fa-solid fa-calendar-plus', color: 'text-blue-600', bg: 'bg-blue-100' },
    BOOKING_ACCEPTED:  { icon: 'fa-solid fa-circle-check',  color: 'text-emerald-600', bg: 'bg-emerald-100' },
    BOOKING_REJECTED:  { icon: 'fa-solid fa-circle-xmark',  color: 'text-rose-600', bg: 'bg-rose-100' },
    BOOKING_PAID:      { icon: 'fa-solid fa-credit-card',   color: 'text-emerald-600', bg: 'bg-emerald-100' },
    BOOKING_CANCELLED: { icon: 'fa-solid fa-ban',           color: 'text-gray-600', bg: 'bg-gray-100' },
    BOOKING_COMPLETED: { icon: 'fa-solid fa-star',          color: 'text-amber-600', bg: 'bg-amber-100' },
    REVIEW_RECEIVED:   { icon: 'fa-solid fa-star',          color: 'text-amber-600', bg: 'bg-amber-100' },
    DISPUTE_OPENED:    { icon: 'fa-solid fa-triangle-exclamation', color: 'text-rose-600', bg: 'bg-rose-100' },
    DISPUTE_RESOLVED:  { icon: 'fa-solid fa-shield-halved', color: 'text-emerald-600', bg: 'bg-emerald-100' },
    DISPUTE_MESSAGE:   { icon: 'fa-regular fa-comment',     color: 'text-violet-600', bg: 'bg-violet-100' },
    KYC_APPROVED:      { icon: 'fa-solid fa-shield-check',  color: 'text-emerald-600', bg: 'bg-emerald-100' },
    KYC_REJECTED:      { icon: 'fa-solid fa-id-card',       color: 'text-rose-600', bg: 'bg-rose-100' },
    PAYOUT_PAID:       { icon: 'fa-solid fa-coins',         color: 'text-emerald-600', bg: 'bg-emerald-100' },
  };
  return map[kind] ?? { icon: 'fa-regular fa-bell', color: 'text-gray-600', bg: 'bg-gray-100' };
}
