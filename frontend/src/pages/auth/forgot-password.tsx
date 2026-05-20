import Link from 'next/link';
import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '@/lib/api/http';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
});
type FormValues = z.infer<typeof schema>;

function friendlyError(e: any): string {
  const status = e?.status ?? e?.response?.status;
  const msg = String(
    e?.body?.error?.message ?? e?.body?.message ?? e?.message ?? '',
  ).toLowerCase();
  if (status === 429 || msg.includes('throttle') || msg.includes('too many')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (msg.includes('network') || msg.includes('failed to fetch')) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}

export default function ForgotPasswordPage() {
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState<string>('');

  return (
    <Layout>
      <div className="mx-auto max-w-md px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-900">Reset your password</h1>
        <p className="mt-1 text-slate-600">
          Enter the email on your account and we'll send you a link to choose a new password.
        </p>

        {sent ? (
          <div className="mt-6 rounded-2xl border border-border bg-white p-6">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
              <i className="fa-solid fa-envelope-circle-check text-xl" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Check your inbox</h2>
            <p className="mt-2 text-sm text-slate-600">
              If <strong>{sentTo}</strong> is registered with us, you'll receive a reset
              link in the next few minutes. The link is valid for 1 hour.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Didn't get an email? Check spam, or{' '}
              <button
                type="button"
                className="font-semibold text-primary hover:underline"
                onClick={() => setSent(false)}
              >
                try a different email
              </button>
              .
            </p>
            <div className="mt-6">
              <Link
                href="/auth/login"
                className="inline-block rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-600"
              >
                Back to login
              </Link>
            </div>
          </div>
        ) : (
          <form
            className="mt-6 space-y-4 rounded-2xl border border-border bg-white p-6"
            onSubmit={form.handleSubmit(async (values) => {
              try {
                await api.post('/auth/forgot-password', { email: values.email });
                setSentTo(values.email);
                setSent(true);
              } catch (e: any) {
                form.setError('root', { message: friendlyError(e) });
              }
            })}
          >
            <div>
              <label className="text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                autoComplete="email"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                {...form.register('email')}
              />
              {form.formState.errors.email ? (
                <p className="mt-1 text-sm text-red-600">
                  {form.formState.errors.email.message}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {form.formState.isSubmitting ? 'Sending…' : 'Send reset link'}
            </button>

            {form.formState.errors.root ? (
              <p className="text-center text-sm text-red-600">
                {form.formState.errors.root.message}
              </p>
            ) : null}

            <p className="text-center text-sm text-slate-600">
              Remembered it?{' '}
              <Link
                href="/auth/login"
                className="font-semibold text-primary hover:text-primary-600"
              >
                Back to login
              </Link>
            </p>
          </form>
        )}
      </div>
    </Layout>
  );
}
