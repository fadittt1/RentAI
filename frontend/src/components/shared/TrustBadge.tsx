/**
 * Trust badge shared by renters and hosts.
 *
 * Score → tier mapping:
 *   ≥ 80  Top      (emerald, badge always shown)
 *   ≥ 65  Trusted  (blue, shown to counterparty + admin)
 *   ≥ 40  Active   (gray, only on profile / admin views)
 *   < 40  hidden by default — `force` can still render it
 */

interface Props {
  score: number;
  /** RENTER badge says "Trusted renter"; HOST says "Top host". */
  role: 'RENTER' | 'HOST';
  /** Show even for low scores (used on the user's own profile / admin). */
  force?: boolean;
  /** Size variant. */
  size?: 'sm' | 'md';
}

interface Tier {
  label: string;
  className: string;
  icon: string;
}

function tierFor(score: number, role: 'RENTER' | 'HOST'): Tier | null {
  const noun = role === 'RENTER' ? 'renter' : 'host';
  if (score >= 80) {
    return {
      label: `Top ${noun}`,
      className: 'border-emerald-300 bg-emerald-50 text-emerald-700',
      icon: 'fa-solid fa-shield-check',
    };
  }
  if (score >= 65) {
    return {
      label: `Trusted ${noun}`,
      className: 'border-blue-300 bg-blue-50 text-blue-700',
      icon: 'fa-solid fa-shield-halved',
    };
  }
  if (score >= 40) {
    return {
      label: `Active ${noun}`,
      className: 'border-gray-300 bg-gray-50 text-gray-700',
      icon: 'fa-regular fa-circle-user',
    };
  }
  return null;
}

export function TrustBadge({ score, role, force, size = 'sm' }: Props) {
  const tier = tierFor(score, role);
  if (!tier && !force) return null;

  const fallback: Tier = {
    label: `New ${role === 'RENTER' ? 'renter' : 'host'}`,
    className: 'border-gray-200 bg-gray-50 text-gray-600',
    icon: 'fa-regular fa-circle-user',
  };
  const t = tier ?? fallback;

  const cls =
    size === 'sm'
      ? 'gap-1 px-2 py-0.5 text-xs'
      : 'gap-1.5 px-3 py-1 text-sm';

  return (
    <span
      title={`Trust score: ${score}/100`}
      className={`inline-flex items-center rounded-full border font-semibold ${t.className} ${cls}`}
    >
      <i className={t.icon} aria-hidden="true" />
      {t.label}
    </span>
  );
}
