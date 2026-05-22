import { toast } from '@/components/ui/Toaster';

interface Props {
  /** Where to send the user after a successful login. */
  next?: string;
  /** Disable buttons (e.g. while the parent form is submitting). */
  disabled?: boolean;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Renders the three social-login buttons under the email/password form on the
 * login and register pages. Only Google is wired today — Apple and Facebook
 * are visual placeholders until we have the developer accounts set up.
 */
export function SocialAuthButtons({ next = '/', disabled = false }: Props) {
  const startGoogle = () => {
    if (disabled) return;
    const url = `${API_BASE}/api/auth/google?next=${encodeURIComponent(next)}`;
    window.location.href = url;
  };

  const comingSoon = (provider: 'Apple' | 'Facebook') => () => {
    toast({
      title: `${provider} sign-in coming soon`,
      message: 'For now, use Google or your email and password.',
      variant: 'info',
    });
  };

  const baseClass =
    'flex w-full items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="space-y-3">
      <div className="relative flex items-center py-1">
        <div className="flex-grow border-t border-gray-200" />
        <span className="mx-3 text-xs uppercase tracking-wider text-gray-400">
          or
        </span>
        <div className="flex-grow border-t border-gray-200" />
      </div>

      <button
        type="button"
        onClick={startGoogle}
        disabled={disabled}
        className={baseClass}
      >
        <GoogleIcon />
        <span>Continue with Google</span>
      </button>

      <button
        type="button"
        onClick={comingSoon('Apple')}
        disabled={disabled}
        className={baseClass}
        aria-label="Continue with Apple (coming soon)"
      >
        <AppleIcon />
        <span>Continue with Apple</span>
      </button>

      <button
        type="button"
        onClick={comingSoon('Facebook')}
        disabled={disabled}
        className={baseClass}
        aria-label="Continue with Facebook (coming soon)"
      >
        <FacebookIcon />
        <span>Continue with Facebook</span>
      </button>
    </div>
  );
}

// ─── Brand icons (inline SVG to avoid extra deps) ───────────────────────────

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.564 12.27c.027 2.92 2.56 3.892 2.589 3.904-.022.07-.405 1.387-1.336 2.747-.804 1.177-1.638 2.35-2.953 2.375-1.292.024-1.708-.767-3.186-.767-1.478 0-1.94.742-3.163.79-1.269.05-2.236-1.273-3.046-2.446-1.657-2.4-2.923-6.78-1.223-9.736.844-1.467 2.353-2.396 3.991-2.42 1.247-.024 2.424.838 3.186.838.762 0 2.192-1.036 3.696-.884.63.026 2.4.255 3.535 1.92-.092.057-2.111 1.234-2.09 3.679M15.13 4.83c.674-.816 1.127-1.952.998-3.082-.967.04-2.137.644-2.834 1.46-.625.722-1.171 1.877-1.023 2.985 1.078.083 2.184-.547 2.859-1.363" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.026 1.79-4.7 4.533-4.7 1.313 0 2.686.235 2.686.235v2.97h-1.514c-1.49 0-1.954.93-1.954 1.886v2.266h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"
      />
    </svg>
  );
}
