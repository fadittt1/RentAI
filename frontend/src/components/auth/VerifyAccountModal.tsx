import { useEffect, useState } from 'react';
import { api } from '@/lib/api/http';
import { toast } from '@/components/ui/Toaster';

type Channel = 'email' | 'phone';

interface Props {
  open: boolean;
  onClose: () => void;
  onVerified: (channel: Channel) => void;
  availableChannels: { email: boolean; phone: boolean };
}

type Step = 'choose' | 'enter-code';

export function VerifyAccountModal({
  open,
  onClose,
  onVerified,
  availableChannels,
}: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [channel, setChannel] = useState<Channel | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (!open) {
      setStep('choose');
      setChannel(null);
      setCode('');
      setError(null);
      setBusy(false);
      setResendIn(0);
    }
  }, [open]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  if (!open) return null;

  const requestCode = async (ch: Channel) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/auth/request-verification', { type: ch });
      const data = (res as any).data ?? res;
      setChannel(ch);
      setStep('enter-code');
      setResendIn(60);
      toast({
        title: 'Code sent',
        message: data?.message ?? `Check your ${ch} for a 6-digit code.`,
        variant: 'success',
      });
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.body?.message ||
        err?.message ||
        'Failed to send code';
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    if (!channel) return;
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/verify', { type: channel, code });
      toast({
        title: 'Verified',
        message: `Your ${channel} has been verified.`,
        variant: 'success',
      });
      onVerified(channel);
      onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.body?.message ||
        err?.message ||
        'Invalid code';
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {step === 'choose' ? 'Verify your account' : `Enter the code`}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <i className="fa-solid fa-times text-lg" />
          </button>
        </div>

        {step === 'choose' && (
          <>
            <p className="mb-4 text-sm text-gray-600">
              We&apos;ll send a 6-digit code to confirm it&apos;s really you.
            </p>
            <div className="space-y-2">
              <button
                type="button"
                disabled={!availableChannels.email || busy}
                onClick={() => requestCode('email')}
                className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-left transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-3">
                  <i className="fa-solid fa-envelope text-blue-500" />
                  <span className="font-medium text-gray-900">Email</span>
                </span>
                <i className="fa-solid fa-chevron-right text-gray-400" />
              </button>
              <button
                type="button"
                disabled={!availableChannels.phone || busy}
                onClick={() => requestCode('phone')}
                className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-left transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-3">
                  <i className="fa-solid fa-mobile-screen text-blue-500" />
                  <span className="font-medium text-gray-900">Phone (SMS)</span>
                </span>
                <i className="fa-solid fa-chevron-right text-gray-400" />
              </button>
            </div>
          </>
        )}

        {step === 'enter-code' && channel && (
          <>
            <p className="mb-4 text-sm text-gray-600">
              A 6-digit code was sent to your{' '}
              <span className="font-medium">{channel}</span>. In development
              the code is printed in the backend console.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="mb-3 w-full rounded-lg border border-gray-300 px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="mb-4 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setStep('choose')}
                className="text-gray-500 hover:text-gray-700"
              >
                <i className="fa-solid fa-chevron-left mr-1" />
                Change method
              </button>
              <button
                type="button"
                disabled={resendIn > 0 || busy}
                onClick={() => requestCode(channel)}
                className="text-blue-600 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-gray-400"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
            </div>
            <button
              type="button"
              disabled={busy || code.length !== 6}
              onClick={submitCode}
              className="w-full rounded-lg bg-blue-500 px-4 py-3 font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Verifying…' : 'Verify'}
            </button>
          </>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-600">
            <i className="fa-solid fa-circle-exclamation mr-1" />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
