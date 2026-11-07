import { Link, useParams } from 'react-router';
import { useBots } from './bots';
import { RobotIcon } from '../../components/icons';

export default function BotPanel() {
  const { botId } = useParams();
  const { bots } = useBots();
  const bot = bots.find((b) => b.id === botId);

  if (!bot) {
    return (
      <div className="bot-missing">
        <h1>Bot not found</h1>
        <p>This bot doesn’t exist or is no longer available.</p>
        <Link to="/app" className="primary-link">Create a new bot</Link>
      </div>
    );
  }

  // TODO: replace with real progress once bots are processed on the server.
  const stages = [
    { title: 'Read best sellers', body: `Study the best-selling books in ${bot.niche}.` },
    { title: 'Style ideas', body: 'Turn what readers loved into human-thought style ideas.' },
    { title: 'Channel identity', body: 'Use the suggested style or define your own identity and characters.' },
  ];

  return (
    <div className="bot-view">
      <header className="bot-head">
        <span className="bot-avatar">
          <RobotIcon />
        </span>
        <div>
          <h1>{bot.name}</h1>
          <span className="bot-niche">{bot.niche}</span>
        </div>
      </header>

      <ol className="bot-stages">
        {stages.map((stage, i) => (
          <li key={stage.title} className="bot-stage">
            <span className="bot-stage-num">{i + 1}</span>
            <div>
              <h2>{stage.title}</h2>
              <p>{stage.body}</p>
            </div>
            <span className="bot-stage-status">Not started</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
