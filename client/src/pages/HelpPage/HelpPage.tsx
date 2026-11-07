import { Link } from 'react-router';
import './HelpPage.css';
import PublicLayout from '../../components/PublicLayout';

const faqs = [
  {
    q: 'What is Twinfluencer?',
    a: 'A platform for creating content bots built around a niche. Each bot reads the best-selling books in its niche and turns what it learns into style ideas for your channel.',
  },
  {
    q: 'How do I create a bot?',
    a: 'Log in, click “New bot” at the top of the sidebar, then type a niche or pick one of the suggestions and press the arrow.',
  },
  {
    q: 'What does “reads the best sellers” mean?',
    a: 'Your bot studies the best-selling books in its niche to learn what resonates with real readers, so its ideas come from human thinking rather than generic filler.',
  },
  {
    q: 'Can I use my own ideas instead?',
    a: 'Yes. You can use the suggested styles as they are, or define your own channel identity and create your own characters.',
  },
  {
    q: 'How many bots can I make?',
    a: 'It depends on your plan. See the pricing page for the limits on each plan.',
  },
  {
    q: 'Is my password safe?',
    a: 'We never store your actual password. It is stored only as a salted scrypt hash, which can’t be turned back into the original password.',
  },
];

export default function HelpPage() {
  return (
    <PublicLayout>
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
          New here? Read <Link to="/about">how Twinfluencer works</Link> or compare{' '}
          <Link to="/pricing">plans</Link>.
        </p>
      </section>
    </PublicLayout>
  );
}
