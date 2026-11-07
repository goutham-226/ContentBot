import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useBots } from './bots';
import { NICHES } from './niches';
import { CheckIcon, RobotIcon } from '../../components/icons';

const MAX_NICHES = 3;

export default function NewBotPanel() {
  const { addBot } = useBots();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);

  const atLimit = selected.length >= MAX_NICHES;

  function toggle(niche: string) {
    setSelected((prev) => {
      if (prev.includes(niche)) return prev.filter((n) => n !== niche);
      return prev.length < MAX_NICHES ? [...prev, niche] : prev;
    });
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selected.length === 0) return;
    const bot = addBot(selected);
    navigate(`/app/bots/${bot.id}`);
  }

  return (
    <div className="new-bot">
      <div className="new-bot-icon">
        <RobotIcon />
      </div>
      <h1>What should your bot master?</h1>
      <p className="new-bot-sub">
        Pick up to {MAX_NICHES} niches. Your bot will read the top-rated articles in each and turn
        them into style ideas for your channel.
      </p>

      <form className="niche-form" onSubmit={handleSubmit}>
        <div className="bubbles" role="group" aria-label={`Niches, choose up to ${MAX_NICHES}`}>
          {NICHES.map((niche) => {
            const isSelected = selected.includes(niche);
            return (
              <button
                key={niche}
                type="button"
                className="bubble"
                aria-pressed={isSelected}
                disabled={atLimit && !isSelected}
                onClick={() => toggle(niche)}
              >
                {isSelected && <CheckIcon />}
                {niche}
              </button>
            );
          })}
        </div>

        <div className="niche-footer">
          <span className="niche-count" aria-live="polite">
            {selected.length} of {MAX_NICHES} selected
          </span>
          <button type="submit" className="niche-create" disabled={selected.length === 0}>
            Create bot
          </button>
        </div>
      </form>
    </div>
  );
}
