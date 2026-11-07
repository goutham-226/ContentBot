import { Link } from 'react-router';
import './HelpPage.css';
import PublicLayout from '../../components/PublicLayout';
import { useSitePath } from '../../components/useInApp';

const faqs = [
  {
    q: 'What is Twinfluencer?',
    a: 'A platform for creating content bots built around a niche. Each bot reads the top-rated articles in its niche and turns what it learns into style ideas for your channel.',
  },
  {
    q: 'How do I create a bot?',
    a: 'Log in and click “New bot” at the top of the sidebar. Pick up to 3 niches and press “Next”, pick a video style for your channel identity or choose your own, then add supporting images (optional for built-in styles, at least one for your own) and press “Create bot”.',
  },
  {
    q: 'What does “reads the top articles” mean?',
    a: 'Your bot studies the top-rated articles in its niche to learn what resonates with real readers, so its ideas come from human thinking rather than generic filler.',
  },
  {
    q: 'Can I use my own ideas instead?',
    a: 'Yes. You can use the suggested styles as they are, or define your own channel identity and create your own characters.',
  },
  {
    q: 'How does pricing work?',
    a: 'You pay per video, with no subscription. Buy 1 video for $7, 5 videos for $29.99, or 10 videos for $60.',
  },
  {
    q: 'Is my password safe?',
    a: 'We never store your actual password. It is stored only as a salted scrypt hash, which can’t be turned back into the original password.',
  },
];

export function HelpContent() {
  const sitePath = useSitePath();

  return (
    <div className="help-content">
      <section className="help-hero">
        <h1>How can we help?</h1>
        <p>Answers to the most common questions about Twinfluencer.</p>
      </section>

      <div className="help-list">
        {faqs.map((faq) => (
          <details key={faq.q} className="help-item">
            <summary>{faq.q}</summary>
            <p>{faq.a}</p>
          </details>
        ))}
      </div>

      <section className="help-more">
        <p>
          New here? Read <Link to={sitePath('about')}>how Twinfluencer works</Link> or compare{' '}
          <Link to={sitePath('pricing')}>plans</Link>.
        </p>
      </section>
    </div>
  );
}

export default function HelpPage() {
  return (
    <PublicLayout>
      <HelpContent />
    </PublicLayout>
  );
}
