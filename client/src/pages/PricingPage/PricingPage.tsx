import { Link } from 'react-router';
import './PricingPage.css';
import PublicLayout from '../../components/PublicLayout';
import { useInApp } from '../../components/useInApp';

// Credit packs. Prices are in cents to avoid floating-point rounding.
// Keep in sync with PACKS in server/src/credits.ts.
const VIDEO_CENTS = 599; // one standard 1-minute video, at the Basic rate
const packs = [
  { id: 'basic', name: 'Basic', videos: 2, priceCents: 1198 },
  { id: 'plus', name: 'Plus', videos: 5, priceCents: 2849 },
  { id: 'pro', name: 'Pro', videos: 10, priceCents: 5399 },
  { id: 'studio', name: 'Studio', videos: 20, priceCents: 10199 },
];

function formatPrice(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

function formatExact(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function PackCta({ name }: { name: string }) {
  const inApp = useInApp();

  if (!inApp) return <Link to="/signup" className="plan-cta">Get started</Link>;
  // TODO: start checkout for this pack.
  return <button type="button" className="plan-cta">Buy {name}</button>;
}

export function PricingContent() {
  const inApp = useInApp();

  return (
    <div className="pricing-content">
      <section className="pricing-hero">
        <h1>{inApp ? 'Buy credits' : 'Credit packs'}</h1>
        <p>No subscription. Buy a pack of credits and save up to 15% on bigger packs.</p>
      </section>

      <ul className="pricing-grid">
        {packs.map(({ id, name, videos, priceCents }) => {
          const savingsCents = VIDEO_CENTS * videos - priceCents;
          const savingsPercent = Math.round((savingsCents / (VIDEO_CENTS * videos)) * 100);

          return (
            <li key={id} className={`plan ${savingsCents > 0 ? 'plan--deal' : ''}`}>
              {savingsCents > 0 && <span className="plan-badge">Save {savingsPercent}%</span>}
              <h2 className="plan-name">{name}</h2>
              <p className="plan-price">
                <span className="plan-amount">{formatPrice(priceCents)}</span>
              </p>
              <p className="plan-per-video">
                Credits for {videos} videos · {formatExact(priceCents / videos)} each
              </p>
              <p className="plan-save">
                {savingsCents > 0 ? `You save ${formatExact(savingsCents)}` : 'Pay as you go'}
              </p>
              <PackCta name={name} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function PricingPage() {
  return (
    <PublicLayout>
      <PricingContent />
    </PublicLayout>
  );
}
