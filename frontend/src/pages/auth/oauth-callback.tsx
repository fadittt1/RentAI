import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth/AuthProvider';

/**
 * Landing page after a successful Google OAuth round-trip.
 *
 * The backend redirects here with the JWTs in the URL fragment:
 *   /auth/oauth-callback#accessToken=…&refreshToken=…&next=/some/path
 *
 * Fragments aren't sent in HTTP requests, so the tokens never appear in
 * server logs or Referer headers.
 */
export default function OAuthCallbackPage() {
  const router = useRouter();
  const { setTokens, refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const raw = window.location.hash.replace(/^#/, '');
    if (!raw) {
      setError('No login data received.');
      return;
    }

    const params = new URLSearchParams(raw);
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    const nextRaw = params.get('next');

    if (!accessToken || !refreshToken) {
      setError('Login response was incomplete. Please try again.');
      return;
    }

    const next =
      nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//')
        ? nextRaw
        : '/';

    (async () => {
      try {
        setTokens(accessToken, refreshToken);
        // Wipe the fragment so refreshing the page doesn't replay the login
        if (window.history?.replaceState) {
          window.history.replaceState(null, '', window.location.pathname);
        }
        await refreshUser();
        await router.replace(next);
      } catch (e: any) {
        setError(e?.message ?? 'Something went wrong while signing you in.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout>
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        {error ? (
          <>
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <i className="fa-solid fa-triangle-exclamation text-xl" />
            </div>
            <h1 className="mb-2 text-xl font-bold text-gray-900">
              Sign-in failed
            </h1>
            <p className="mb-6 text-sm text-gray-600">{error}</p>
            <Link
              href="/auth/login"
              className="inline-block rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-600"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <i className="fa-solid fa-circle-notch fa-spin text-xl" />
            </div>
            <h1 className="mb-2 text-xl font-bold text-gray-900">
              Signing you in…
            </h1>
            <p className="text-sm text-gray-600">
              One moment while we set up your session.
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
