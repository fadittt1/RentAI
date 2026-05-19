import Link from 'next/link';
import { Layout } from '@/components/layout/Layout';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/router';
import { useAuth } from '@/lib/auth/AuthProvider';
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons';

const schema = z.object({
  emailOrPhone: z.string().min(3),
  password: z.string().min(6),
});
type FormValues = z.infer<typeof schema>;

// Only redirect to internal paths to prevent open-redirect attacks
function safeNext(raw: unknown): string {
  if (typeof raw !== 'string') return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

function friendlyAuthError(e: any): string {
  const status = e?.status ?? e?.response?.status;
  const msg = String(
    e?.body?.error?.message ?? e?.body?.message ?? e?.message ?? '',
  ).toLowerCase();
  if (status === 401 || msg.includes('invalid credentials')) {
    return 'Email or password is incorrect.';
  }
  if (status === 403 || msg.includes('suspended')) {
    return 'This account has been suspended. Contact support.';
  }
  if (msg.includes('network') || msg.includes('failed to fetch')) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  if (status === 429 || msg.includes('throttle') || msg.includes('too many')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  return 'Login failed. Please try again.';
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const next = safeNext(router.query.next);

  return (
    <Layout>
      <div className="mx-auto max-w-md px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-900">Login</h1>
        <p className="mt-1 text-slate-600">
          Access your rentals and host tools.
        </p>

        <form
          className="mt-6 space-y-4 rounded-2xl border border-border bg-white p-6"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await login(values);
              await router.push(next);
            } catch (e: any) {
              form.setError('root', { message: friendlyAuthError(e) });
            }
          })}
        >
          <div>
            <label className="text-sm font-medium text-slate-700">
              Email or phone
            </label>
            <input
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              {...form.register('emailOrPhone')}
            />
            {form.formState.errors.emailOrPhone ? (
              <p className="mt-1 text-sm text-red-600">
                {form.formState.errors.emailOrPhone.message}
              </p>
            ) : null}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              {...form.register('password')}
            />
            {form.formState.errors.password ? (
              <p className="mt-1 text-sm text-red-600">
                {form.formState.errors.password.message}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {form.formState.isSubmitting ? 'Logging in…' : 'Login'}
          </button>

          {form.formState.errors.root ? (
            <p className="text-center text-sm text-red-600">
              {form.formState.errors.root.message}
            </p>
          ) : null}

          <p className="text-center text-sm text-slate-600">
            No account?{' '}
            <Link
              href={next === '/' ? '/auth/register' : `/auth/register?next=${encodeURIComponent(next)}`}
              className="font-semibold text-primary hover:text-primary-600"
            >
              Register
            </Link>
          </p>

          <SocialAuthButtons next={next} disabled={form.formState.isSubmitting} />
        </form>
      </div>
    </Layout>
  );
}
