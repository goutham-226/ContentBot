import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useBots } from './bots';
import { ArrowUpIcon, RobotIcon } from '../../components/icons';

const SUGGESTIONS = ['Personal finance', 'Fantasy fiction', 'Fitness', 'Startups', 'Self-improvement', 'History'];

export default function NewBotPanel() {
  const { addBot } = useBots();
  const navigate = useNavigate();
  const [niche, setNiche] = useState('');

  const canCreate = niche.trim().length > 0;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canCreate) return;
    const bot = addBot(niche);
    navigate(`/app/bots/${bot.id}`);
  }

  return (
    <div className="new-bot">
      <div className="new-bot-icon">
        <RobotIcon />
      </div>
      <h1>What niche should your bot master?</h1>
      <p className="new-bot-sub">
        It will read the best-selling books in that niche and turn them into style ideas for your channel.
      </p>

      <form className="composer" onSubmit={handleSubmit}>
        <label htmlFor="niche" className="sr-only">Niche</label>
        <input
          id="niche"
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          placeholder="e.g. Personal finance for students"
          autoComplete="off"
          maxLength={80}
        />
        <button type="submit" className="composer-send" disabled={!canCreate} aria-label="Create bot">
          <ArrowUpIcon />
        </button>
      </form>

      <div className="chips">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => setNiche(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
