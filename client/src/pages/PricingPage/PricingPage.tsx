import { Link } from 'react-router';
import './PricingPage.css';
import PublicLayout from '../../components/PublicLayout';
import { CheckIcon } from '../../components/icons';

// Placeholder plans: edit names, prices and limits here.
const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    blurb: 'Try Twinfluencer with a single bot.',
    features: ['1 bot', 'Style ideas from top best sellers', 'Suggested channel identity'],
    cta: 'Get started',
    featured: false,
  },
  {
    name: 'Creator',
    price: '$12',
    period: 'per month',
    blurb: 'For creators running a channel or two.',
    features: ['5 bots', 'Deeper best-seller reading', 'Custom channel identity', 'Custom characters'],
    cta: 'Start Creator',
    featured: true,
  },
  {
    name: 'Studio',
    price: '$39',
    period: 'per month',
    blurb: 'For teams and multi-channel studios.',
    features: ['Unlimited bots', 'Everything in Creator', 'Team seats', 'Priority support'],
    cta: 'Start Studio',
    featured: false,
  },
];

export default function PricingPage() {
  return (
    <PublicLayout>
      <section className="pricing-hero">
        <h1>Simple pricing</h1>
        <p>Start free. Upgrade when your channel needs more bots.</p>
      </section>

      <ul className="pricing-grid">
        {plans.map((plan) => (
          <li key={plan.name} className={`plan ${plan.featured ? 'plan--featured' : ''}`}>
            {plan.featured && <span className="plan-badge">Most popular</span>}
            <h2 className="plan-name">{plan.name}</h2>
            <p className="plan-price">
              <span className="plan-amount">{plan.price}</span>
              <span className="plan-period">{plan.period}</span>
            </p>
            <p className="plan-blurb">{plan.blurb}</p>
            <ul className="plan-features">
              {plan.features.map((feature) => (
                <li key={feature}>
                  <CheckIcon />
                  {feature}
                </li>
              ))}
            </ul>
            <Link to="/signup" className="plan-cta">{plan.cta}</Link>
          </li>
        ))}
      </ul>
    </PublicLayout>
  );
}
