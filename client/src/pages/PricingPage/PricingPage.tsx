import { Link } from 'react-router';
import './PricingPage.css';
import PublicLayout from '../../components/PublicLayout';
import { useInApp } from '../../components/useInApp';

// Video bundles. Prices are in cents to avoid floating-point rounding.
const SINGLE_VIDEO_CENTS = 700;
const bundles = [
  { videos: 1, priceCents: 700 },
  { videos: 5, priceCents: 2999 },
  { videos: 10, priceCents: 6000 },
];

function formatPrice(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

function formatExact(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function BundleCta({ videos }: { videos: number }) {
  const inApp = useInApp();
  const label = videos === 1 ? 'Buy 1 video' : `Buy ${videos} videos`;

  if (!inApp) return <Link to="/signup" className="plan-cta">Get started</Link>;
  // TODO: start checkout for this bundle.
  return <button type="button" className="plan-cta">{label}</button>;
}

export function PricingContent() {
  const inApp = useInApp();

  return (
    <div className="pricing-content">
      <section className="pricing-hero">
        <h1>{inApp ? 'Buy videos' : 'Pay per video'}</h1>
        <p>No subscription. Buy videos in bundles and save up to 14%.</p>
      </section>

      <ul className="pricing-grid">
        {bundles.map(({ videos, priceCents }) => {
          const savingsCents = SINGLE_VIDEO_CENTS * videos - priceCents;
          const savingsPercent = Math.round((savingsCents / (SINGLE_VIDEO_CENTS * videos)) * 100);

          return (
            <li key={videos} className={`plan ${savingsCents > 0 ? 'plan--deal' : ''}`}>
              {savingsCents > 0 && <span className="plan-badge">Save {savingsPercent}%</span>}
              <h2 className="plan-name">{videos === 1 ? '1 video' : `${videos} videos`}</h2>
              <p className="plan-price">
                <span className="plan-amount">{formatPrice(priceCents)}</span>
              </p>
              <p className="plan-per-video">{formatExact(priceCents / videos)} per video</p>
              <p className="plan-save">
                {savingsCents > 0 ? `You save ${formatExact(savingsCents)}` : 'Pay as you go'}
              </p>
              <BundleCta videos={videos} />
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
