import type { GetServerSideProps } from 'next';

/**
 * /sitemap.xml — server-side generated sitemap.
 *
 * Lists static crawlable pages plus one entry per active listing fetched
 * from the public API. Falls back to a minimal sitemap (static pages only)
 * if the API is unreachable, so crawlers always get *something*.
 *
 * Set NEXT_PUBLIC_SITE_URL to your production origin (no trailing slash).
 */

interface ListingSitemapEntry {
  id: string;
  updatedAt?: string;
}

const STATIC_PATHS = ['/', '/search', '/last-minute', '/help'];

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildXml(
  siteBase: string,
  listings: ListingSitemapEntry[],
): string {
  const urls: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const p of STATIC_PATHS) {
    urls.push(
      `<url><loc>${xmlEscape(siteBase + p)}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq></url>`,
    );
  }

  for (const l of listings) {
    const lastmod = l.updatedAt ? l.updatedAt.slice(0, 10) : today;
    urls.push(
      `<url><loc>${xmlEscape(`${siteBase}/listings/${l.id}`)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq></url>`,
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
}

export default function SiteMap() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ||
    process.env.API_INTERNAL_URL?.replace(/\/$/, '') ||
    'http://localhost:3001';
  const siteBase =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    'https://renteverything.tn';

  let listings: ListingSitemapEntry[] = [];
  try {
    // Sitemaps support up to 50k URLs each; cap at 5000 to keep response
    // small. If you outgrow this, split into sitemap-1.xml etc.
    const r = await fetch(`${apiBase}/api/listings?limit=5000`, {
      headers: { Accept: 'application/json' },
    });
    if (r.ok) {
      const body = await r.json();
      const arr = body?.data?.items ?? body?.data ?? body?.items ?? body;
      if (Array.isArray(arr)) {
        listings = arr
          .filter((x: any) => x?.id && (x.isActive ?? true) && !x.deletedAt)
          .map((x: any) => ({ id: x.id, updatedAt: x.updatedAt }));
      }
    }
  } catch {
    // fall through to the static-only sitemap
  }

  const xml = buildXml(siteBase, listings);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  // 1h CDN cache — sitemaps don't need to be live-current.
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.write(xml);
  res.end();
  return { props: {} };
};
