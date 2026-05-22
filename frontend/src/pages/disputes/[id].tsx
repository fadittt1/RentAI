import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layout } from '@/components/layout/Layout';
import { api } from '@/lib/api/http';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { InlineError } from '@/components/ui/InlineError';
import { toast } from '@/components/ui/Toaster';
import { formatTnd } from '@/lib/utils/format';
import { API_URL } from '@/lib/api/env';

interface Message {
  id: string;
  body: string;
  attachments: string[];
  createdAt: string;
  isAdmin: boolean;
  author: { id: string; name: string; avatarUrl: string | null };
}

interface DisputeDetail {
  id: string;
  status: 'OPEN' | 'RESOLVED' | 'NONE';
  resolution: string;
  refundAmount: number | string | null;
  reason: string;
  description: string;
  openedBy: 'RENTER' | 'HOST';
  createdAt: string;
  resolvedAt: string | null;
  resolverNotes: string | null;
  booking: {
    id: string;
    totalPrice: number | string;
    listing: { id: string; title: string; images: string[] };
    renter: { id: string; name: string; avatarUrl: string | null };
    host: { id: string; name: string; avatarUrl: string | null };
  };
  messages: Message[];
}

export default function DisputeDetailPage() {
  const router = useRouter();
  const id = router.query.id as string | undefined;
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  const q = useQuery({
    queryKey: ['dispute', id],
    enabled: !!id,
    queryFn: async () => (await api.get(`/disputes/${id}`)).data as DisputeDetail,
  });

  const post = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      if (body.trim()) form.append('body', body.trim());
      for (const f of files) form.append('attachments', f);
      await api.post(`/disputes/${id}/messages`, form);
    },
    onSuccess: () => {
      setBody('');
      setFiles([]);
      if (fileRef.current) fileRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['dispute', id] });
    },
    onError: (e: any) => {
      toast({
        title: 'Send failed',
        message: e?.response?.data?.message ?? 'Please try again.',
        variant: 'error',
      });
    },
  });

  if (q.isLoading) {
    return (
      <Layout>
        <div className="mx-auto max-w-3xl px-6 py-10">
          <LoadingCard />
        </div>
      </Layout>
    );
  }

  if (q.isError || !q.data) {
    return (
      <Layout>
        <div className="mx-auto max-w-3xl px-6 py-10">
          <InlineError message="Could not load this dispute." />
          <Link href="/disputes" className="mt-4 inline-block text-sm font-semibold text-primary">
            ← Back to disputes
          </Link>
        </div>
      </Layout>
    );
  }

  const d = q.data;
  const closed = d.status === 'RESOLVED';

  return (
    <Layout>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/disputes" className="text-sm font-semibold text-primary hover:underline">
          ← All disputes
        </Link>

        <div className="mt-3 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">
            {d.booking.listing.title}
          </h1>
          {closed ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              Resolved · {d.resolution.replace('_', ' ')}
            </span>
          ) : (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              Open
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {d.reason.replace('_', ' ').toLowerCase()} · opened by {d.openedBy.toLowerCase()} · {' '}
          {formatTnd(Number(d.booking.totalPrice))} at stake
        </p>

        {closed && d.resolverNotes ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <div className="font-semibold">Admin decision</div>
            <p className="mt-1 whitespace-pre-wrap">{d.resolverNotes}</p>
            {d.refundAmount != null ? (
              <p className="mt-1 text-xs text-emerald-700">
                Refund amount: {formatTnd(Number(d.refundAmount))}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          {d.messages.map((m) => (
            <MessageBubble key={m.id} m={m} />
          ))}
        </div>

        {!closed ? (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Add a message or upload evidence…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []).slice(0, 5);
                setFiles(list);
              }}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <i className="fa-solid fa-paperclip mr-1" />
                {files.length > 0 ? `${files.length} photo(s) attached` : 'Add photos'}
              </button>
              <button
                type="button"
                onClick={() => post.mutate()}
                disabled={post.isPending || (!body.trim() && files.length === 0)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60"
              >
                {post.isPending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
            This dispute is closed.
          </p>
        )}
      </div>
    </Layout>
  );
}

function MessageBubble({ m }: { m: Message }) {
  const tone = m.isAdmin
    ? 'border-violet-200 bg-violet-50'
    : 'border-gray-200 bg-white';
  return (
    <div className={`rounded-2xl border ${tone} p-3`}>
      <div className="flex items-center gap-2 text-xs text-gray-600">
        <span className="font-semibold text-gray-900">
          {m.author.name}
          {m.isAdmin ? ' · Admin' : ''}
        </span>
        <span>· {new Date(m.createdAt).toLocaleString()}</span>
      </div>
      {m.body ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{m.body}</p>
      ) : null}
      {m.attachments?.length ? (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {m.attachments.map((url, i) => {
            const full = url.startsWith('http') ? url : `${API_URL}${url}`;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={i} href={full} target="_blank" rel="noopener noreferrer">
                <img
                  src={full}
                  alt="evidence"
                  className="h-24 w-full rounded-lg border border-gray-200 object-cover"
                />
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
