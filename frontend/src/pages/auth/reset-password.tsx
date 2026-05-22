import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Layout } from '@/components/layout/Layout';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '@/lib/api/http';

const schema = z
  .object({
    password: z.string().min(6, 'At least 6 characters'),
    confirm: z.string().min(6),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match",
    path: ['confirm'],
  });
type FormValues = z.infer<typeof schema>;

function friendlyError(e: any): string {
  const status = e?.status ?? e?.response?.status;
  const msg = String(
    e?.body?.error?.message ?? e?.body?.message ?? e?.message ?? '',
  ).toLowerCase();
  if (msg.includes('invalid') || msg.includes('used')) {
    return 'This reset link is invalid or has already been used. Request a new one.';
  }
  if (msg.includes('expired')) {
    return 'This reset link has expired. Request a new one.';
  }
  if (status === 429 || msg.includes('too many')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  return 'Could not reset your password. Please try again.';
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const [token, setToken] = useState<string>('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const raw = router.query.token;
    if (typeof raw === 'string' && raw.length >= 20) {
      setToken(raw);
    }
  }, [router.isReady, router.query.token]);

  const missingToken = router.isReady && !token;

  return (
    <Layout>
      <div className="mx-auto max-w-md px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-900">Choose a new password</h1>
        <p className="mt-1 text-slate-600">
          Enter your new password below. You'll be logged out of other sessions.
        </p>

        {done ? (
          <div className="mt-6 rounded-2xl border border-border bg-white p-6">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
              <i className="fa-solid fa-circle-check text-xl" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Password updated</h2>
            <p className="mt-2 text-sm text-slate-600">
              You can now sign in with your new password.
            </p>
            <div className="mt-6">
              <Link
                href="/auth/login"
                className="inline-block rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-600"
              >
                Go to login
              </Link>
            </div>
          </div>
        ) : missingToken ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
            <h2 className="text-lg font-semibold text-red-700">Invalid reset link</h2>
            <p className="mt-2 text-sm text-red-700">
              This link is missing its token. Request a new password reset email.
            </p>
            <div className="mt-4">
              <Link
                href="/auth/forgot-password"
                className="inline-block rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-600"
              >
                Request a new link
              </Link>
            </div>
          </div>
        ) : (
          <form
            className="mt-6 space-y-4 rounded-2xl border border-border bg-white p-6"
            onSubmit={form.handleSubmit(async (values) => {
              try {
                await api.post('/auth/reset-password', {
                  token,
                  password: values.password,
                });
                setDone(true);
              } catch (e: any) {
                form.setError('root', { message: friendlyError(e) });
              }
            })}
          >
            <div>
              <label className="text-sm font-medium text-slate-700">New password</label>
              <input
                type="password"
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                {...form.register('password')}
              />
              <p className="mt-1 text-xs text-slate-500">At least 6 characters.</p>
              {form.formState.errors.password ? (
                <p className="mt-1 text-sm text-red-600">
                  {form.formState.errors.password.message}
                </p>
              ) : null}
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Confirm password</label>
              <input
                type="password"
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                {...form.register('confirm')}
              />
              {form.formState.errors.confirm ? (
                <p className="mt-1 text-sm text-red-600">
                  {form.formState.errors.confirm.message}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={form.formState.isSubmitting || !token}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {form.formState.isSubmitting ? 'Saving…' : 'Set new password'}
            </button>

            {form.formState.errors.root ? (
              <p className="text-center text-sm text-red-600">
                {form.formState.errors.root.message}
              </p>
            ) : null}
          </form>
        )}
      </div>
    </Layout>
  );
}
