import { Link } from 'react-router';
import './AboutPage.css';
import Footer from '../../components/Footer';

const steps = [
  {
    title: 'Pick a niche',
    body: 'Create a bot and give it a focus: personal finance, fantasy, fitness, startups, whatever your channel is about.',
  },
  {
    title: 'It reads the best sellers',
    body: 'Your bot studies the best-selling books in that niche to learn what resonates with real readers.',
  },
  {
    title: 'Get human-thought ideas',
    body: 'You get a set of style ideas drawn from what people actually wrote and loved, not generic, recycled filler.',
  },
];

export default function AboutPage() {
  return (
    <div className="about-page">
      <header className="about-header">
        <Link to="/" className="about-brand">
          <img src="/logo.svg" alt="" className="about-brand-logo" />
          <span>Twinfluencer</span>
        </Link>
        <Link to="/" className="about-login">Log in</Link>
      </header>

      <main className="about-main">
        <section className="about-hero">
          <img src="/logo.svg" alt="" className="about-hero-logo" />
          <h1>
            Bots that create like <span className="accent">your niche’s best authors</span>
          </h1>
          <p className="about-lead">
            Twinfluencer is a platform for creating content bots built around a niche. Each bot
            learns from the best-selling books in its field, so the ideas it gives you are grounded
            in human thinking.
          </p>
        </section>

        <section className="about-section" aria-labelledby="how-heading">
          <h2 id="how-heading">How it works</h2>
          <ol className="about-steps">
            {steps.map((step, i) => (
              <li key={step.title} className="about-card">
                <span className="about-step-num">{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="about-section about-card about-identity" aria-labelledby="identity-heading">
          <h2 id="identity-heading">Your channel, your identity</h2>
          <p>
            Use the suggested styles as they are, or bring your own ideas. Define your channel’s
            identity, its voice, tone and personality, and create the characters that appear in
            your content. Twinfluencer works around your vision, not the other way round.
          </p>
        </section>

        <section className="about-cta">
          <h2>Ready to build your first bot?</h2>
          <Link to="/" className="about-cta-btn">Get started</Link>
        </section>
      </main>

      <Footer />
    </div>
  );
}
