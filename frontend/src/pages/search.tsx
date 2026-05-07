import { Layout } from '@/components/layout/Layout';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import { ListingCard } from '@/components/shared/ListingCard';
import { LoadingCard } from '@/components/ui/LoadingCard';
import { EmptyState } from '@/components/ui/EmptyState';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const DEFAULT_LAT = 36.8578;
const DEFAULT_LNG = 11.092;
const DEFAULT_RADIUS = 10;

type AiMode = 'idle' | 'loading' | 'follow_up' | 'result' | 'error';
interface Chip { key: string; label: string; }
interface FollowUp { question: string; field: string; options?: string[]; }

async function fetchListings(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  });
  const res = await fetch(`${API}/api/listings?${qs}`);
  if (!res.ok) throw new Error('Listings fetch failed');
  const json = await res.json();
  const raw = json?.data ?? json;
  return Array.isArray(raw) ? raw : (raw?.items ?? []);
}

export default function SearchPage() {
  const router = useRouter();

  const urlQ            = typeof router.query.q            === 'string' ? router.query.q            : '';
  const urlCategorySlug = typeof router.query.categorySlug === 'string' ? router.query.categorySlug : '';
  const urlCategory     = typeof router.query.category     === 'string' ? router.query.category     : '';

  const [inputQ, setInputQ]           = useState(urlQ);
  const [aiMode, setAiMode]           = useState<AiMode>('idle');
  const [chips, setChips]             = useState<Chip[]>([]);
  const [followUp, setFollowUp]       = useState<FollowUp | null>(null);
  const [aiResults, setAiResults]     = useState<any[]>([]);
  const [fallbackResults, setFallbackResults] = useState<any[]>([]);
  const [fallbackLoading, setFallbackLoading] = useState(false);
  const [followUpAnswer, setFollowUpAnswer]   = useState('');
  const [lastQuery, setLastQuery]     = useState('');
  const isReady = useRef(false);

  // ── fallback listing fetch (for category browse or when AI fails) ───────────
  useEffect(() => {
    if (!router.isReady) return;
    if (urlQ) return; // AI search takes over when there's a query
    setFallbackLoading(true);
    fetchListings({
      q:            urlQ || undefined,
      categorySlug: urlCategorySlug || undefined,
      category:     urlCategory || undefined,
      lat:          DEFAULT_LAT,
      lng:          DEFAULT_LNG,
      radiusKm:     DEFAULT_RADIUS,
      limit:        30,
    })
      .then(setFallbackResults)
      .catch(() => setFallbackResults([]))
      .finally(() => setFallbackLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, urlCategorySlug, urlCategory]);

  // ── auto-run AI search on initial load when there's a q param ──────────────
  useEffect(() => {
    if (!router.isReady || isReady.current) return;
    isReady.current = true;
    if (urlQ) {
      setInputQ(urlQ);
      void runAiSearch(urlQ, false, '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // ── AI search logic ─────────────────────────────────────────────────────────
  async function runAiSearch(query: string, followUpUsed: boolean, followUpAns: string) {
    if (!query.trim()) return;
    setAiMode('loading');
    setLastQuery(query);
    try {
      const res = await fetch(`${API}/api/ai/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          lat: DEFAULT_LAT,
          lng: DEFAULT_LNG,
          radiusKm: DEFAULT_RADIUS,
          followUpUsed,
          followUpAnswer: followUpAns || '',
        }),
      });
      if (!res.ok) throw new Error('AI error');
      const json = await res.json();
      const data = json?.data ?? json;

      setChips(data.chips ?? []);
      if (data.mode === 'FOLLOW_UP') {
        setFollowUp(data.followUp ?? null);
        setAiResults([]);
        setAiMode('follow_up');
      } else {
        setFollowUp(null);
        setAiResults(data.results ?? []);
        setAiMode('result');
      }
    } catch {
      // AI unavailable — fall back to keyword search
      setAiMode('error');
      setFallbackLoading(true);
      fetchListings({ q: query, lat: DEFAULT_LAT, lng: DEFAULT_LNG, radiusKm: DEFAULT_RADIUS, limit: 30 })
        .then(setFallbackResults)
        .catch(() => setFallbackResults([]))
        .finally(() => setFallbackLoading(false));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputQ.trim()) return;
    setChips([]);
    setFollowUp(null);
    setFollowUpAnswer('');
    void runAiSearch(inputQ, false, '');
  }

  function handleFollowUpAnswer(answer: string) {
    void runAiSearch(lastQuery, true, answer);
  }

  function handleSkipFollowUp() {
    void runAiSearch(lastQuery, true, '');
  }

  // ── what to display ─────────────────────────────────────────────────────────
  const isAiLoading   = aiMode === 'loading';
  const showAi        = aiMode === 'result' || aiMode === 'follow_up';
  const displayItems  = showAi ? aiResults : fallbackResults;
  const isLoading     = isAiLoading || (aiMode === 'idle' && fallbackLoading);

  const resultLabel = showAi
    ? `${aiResults.length} result${aiResults.length !== 1 ? 's' : ''} found`
    : urlCategorySlug
    ? `Browsing: ${urlCategorySlug}`
    : lastQuery || urlQ
    ? `Results for "${lastQuery || urlQ}"`
    : 'All listings';

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-6 py-8">

        {/* ── Search bar ───────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={inputQ}
                onChange={(e) => setInputQ(e.target.value)}
                placeholder="Search in natural language… e.g. villa near beach under 300 TND"
                className="w-full rounded-xl border border-gray-300 py-3 pl-11 pr-4 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isAiLoading}
              className="rounded-xl bg-blue-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
            >
              {isAiLoading
                ? <i className="fa-solid fa-spinner animate-spin" />
                : 'Search'
              }
            </button>
          </div>
        </form>

        {/* ── "What I understood" chips ────────────────────────────────────── */}
        {chips.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              What I understood:
            </span>
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
              >
                {chip.label}
                <button
                  onClick={() => setChips((c) => c.filter((x) => x.key !== chip.key))}
                  className="ml-1 hover:text-blue-900"
                >
                  <i className="fa-solid fa-xmark text-xs" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* ── AI follow-up question ─────────────────────────────────────────── */}
        {aiMode === 'follow_up' && followUp && (
          <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500">
                <i className="fa-solid fa-robot text-sm text-white" />
              </div>
              <p className="text-sm font-medium text-gray-900">{followUp.question}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(followUp.options ?? []).map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleFollowUpAnswer(opt)}
                  className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
                >
                  {opt}
                </button>
              ))}
              <button
                onClick={handleSkipFollowUp}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-500 transition hover:bg-gray-50"
              >
                Skip →
              </button>
            </div>
          </div>
        )}

        {/* ── AI unavailable notice ─────────────────────────────────────────── */}
        {aiMode === 'error' && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <i className="fa-solid fa-triangle-exclamation" />
            AI search unavailable — showing keyword results instead.
          </div>
        )}

        {/* ── Results header ────────────────────────────────────────────────── */}
        {(aiMode !== 'idle' || urlCategorySlug || urlQ) && (
          <p className="mb-4 text-sm text-gray-500">{resultLabel}</p>
        )}

        {/* ── Results grid ─────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => <LoadingCard key={i} />)}
          </div>
        ) : displayItems.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {displayItems.map((l: any) => <ListingCard key={l.id} listing={l} />)}
          </div>
        ) : aiMode !== 'follow_up' && (aiMode !== 'idle' || urlCategorySlug || urlQ) ? (
          <EmptyState
            icon="fa-solid fa-magnifying-glass"
            title="No results"
            message={
              showAi
                ? 'AI found no matching listings. Try rephrasing your search.'
                : 'Try a different search or category.'
            }
            cta={{ label: 'Clear search', href: '/search' }}
          />
        ) : null}

        {/* ── Default empty state (no query, no category) ──────────────────── */}
        {aiMode === 'idle' && !urlCategorySlug && !urlQ && !fallbackLoading && (
          <div className="text-center py-16">
            <i className="fa-solid fa-magnifying-glass text-5xl text-gray-300 mb-4" />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">What are you looking for?</h2>
            <p className="text-gray-500 text-sm">
              Try searching in natural language — e.g. &ldquo;beach house for this weekend under 200 TND&rdquo;
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
