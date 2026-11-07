import { Link } from 'react-router';
import './AboutPage.css';
import PublicLayout from '../../components/PublicLayout';
import { useInApp } from '../../components/useInApp';
import { HeroArt, IdeasArt, IdentityArt, NicheArt, ReadArt } from './Illustrations';

const steps = [
  {
    title: 'Pick a niche',
    body: 'Create a bot and give it a focus: personal finance, fantasy, fitness, startups, whatever your channel is about.',
    Art: NicheArt,
  },
  {
    title: 'It reads the top articles',
    body: 'Your bot studies the top-rated articles in that niche to learn what resonates with real readers.',
    Art: ReadArt,
  },
  {
    title: 'Get human-thought ideas',
    body: 'You get a set of style ideas drawn from what people actually wrote and loved, not generic, recycled filler.',
    Art: IdeasArt,
  },
];

export function AboutContent() {
  const inApp = useInApp();

  return (
    <div className="about-content">
      <section className="about-hero">
        <div className="about-hero-art">
          <HeroArt />
        </div>
        <h1>
          Bots that create like <span className="accent">your niche’s best writers</span>
        </h1>
        <p className="about-lead">
          Twinfluencer is a platform for creating content bots built around a niche. Each bot
          learns from the top-rated articles in its field, so the ideas it gives you are grounded
          in human thinking.
        </p>
      </section>

      <section className="about-section" aria-labelledby="how-heading">
        <h2 id="how-heading">How it works</h2>
        <ol className="about-steps">
          {steps.map((step, i) => (
            <li key={step.title} className="about-card">
              <div className="about-step-art">
                <step.Art />
              </div>
              <span className="about-step-num">{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="about-section about-card about-identity" aria-labelledby="identity-heading">
        <div>
          <h2 id="identity-heading">Your channel, your identity</h2>
          <p>
            Use the suggested styles as they are, or bring your own ideas. Define your channel’s
            identity, its voice, tone and personality, and create the characters that appear in
            your content. Twinfluencer works around your vision, not the other way round.
          </p>
        </div>
        <IdentityArt />
      </section>

      <section className="about-cta">
        <h2>Ready to build your first bot?</h2>
        <Link to={inApp ? '/app' : '/signup'} className="about-cta-btn">
          {inApp ? 'Create a bot' : 'Get started'}
        </Link>
      </section>
    </div>
  );
}

export default function AboutPage() {
  return (
    <PublicLayout>
      <AboutContent />
    </PublicLayout>
  );
}
