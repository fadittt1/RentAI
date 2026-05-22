import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/http';
import { toast } from '@/components/ui/Toaster';
import { formatTnd } from '@/lib/utils/format';

interface AdjustmentRow {
  id: string;
  oldPrice: number | string;
  newPrice: number | string;
  basePrice: number | string;
  multiplier: number | string;
  reason: string;
  createdAt: string;
}

interface Props {
  listingId: string;
  enabled: boolean;
  pricePerDay: number;
  basePricePerDay: number | null;
  onToggle?: (enabled: boolean, restoredPrice?: number) => void;
}

export function SmartPricingCard({
  listingId,
  enabled,
  pricePerDay,
  basePricePerDay,
  onToggle,
}: Props) {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const historyQ = useQuery({
    queryKey: ['smart-pricing', 'history', listingId],
    enabled,
    queryFn: async () =>
      (await api.get(`/dynamic-pricing/listings/${listingId}/history`)).data as AdjustmentRow[],
  });

  const toggle = async () => {
    setSubmitting(true);
    try {
      const res = await api.post(`/dynamic-pricing/listings/${listingId}/toggle`);
      const isOn = !!res.data?.dynamicPricing;
      const restored = res.data?.pricePerDay;
      toast({
        title: isOn ? 'Smart Pricing enabled' : 'Smart Pricing disabled',
        message: isOn
          ? `We'll adjust your price daily around ${formatTnd(res.data?.basePricePerDay ?? pricePerDay)}.`
          : `Price restored to your base ${formatTnd(restored ?? pricePerDay)}.`,
        variant: 'success',
      });
      onToggle?.(isOn, typeof restored === 'number' ? restored : undefined);
      queryClient.invalidateQueries({ queryKey: ['smart-pricing'] });
    } catch (e: any) {
      toast({
        title: 'Toggle failed',
        message: e?.response?.data?.message ?? 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const rows = historyQ.data ?? [];
  const earnedLast30d = rows
    .filter((r) => new Date(r.createdAt) > new Date(Date.now() - 30 * 86400 * 1000))
    .reduce((acc, r) => acc + (Number(r.newPrice) - Number(r.basePrice)), 0);

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-indigo-900">
            <i className="fa-solid fa-wand-magic-sparkles" />
            Smart Pricing
          </h3>
          <p className="mt-1 text-sm text-indigo-800">
            We adjust your price daily within ±30% of your base price based on
            demand, comparable listings, your open calendar, weekends, and
            season. You can toggle it off any time — your base price comes back.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={submitting}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
            enabled
              ? 'bg-indigo-500 text-white hover:bg-indigo-600'
              : 'border border-indigo-400 bg-white text-indigo-700 hover:bg-indigo-50'
          } disabled:opacity-60`}
        >
          {submitting ? 'Working…' : enabled ? 'On — turn off' : 'Turn on'}
        </button>
      </div>

      {enabled ? (
        <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
          <Stat
            label="Base"
            value={formatTnd(basePricePerDay ?? pricePerDay)}
          />
          <Stat label="Current" value={formatTnd(pricePerDay)} />
          <Stat
            label="Last 30d lift"
            value={
              earnedLast30d > 0
                ? `+${formatTnd(earnedLast30d)}`
                : earnedLast30d < 0
                  ? formatTnd(earnedLast30d)
                  : '—'
            }
          />
        </div>
      ) : null}

      {enabled && rows.length > 0 ? (
        <div className="mt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-900">
            Recent adjustments
          </h4>
          <ul className="space-y-2">
            {rows.slice(0, 5).map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-indigo-100 bg-white p-3 text-xs"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-gray-900">
                    {formatTnd(Number(r.oldPrice))} →{' '}
                    <strong>{formatTnd(Number(r.newPrice))}</strong>
                  </span>
                  <span className="text-gray-500">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 text-gray-600">{r.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {enabled && rows.length === 0 && !historyQ.isLoading ? (
        <p className="mt-4 text-xs text-indigo-800">
          No adjustments yet — the next nightly run will check this listing.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-indigo-100 bg-white p-3">
      <div className="text-[10px] uppercase tracking-wide text-indigo-700">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-gray-900">{value}</div>
    </div>
  );
}
