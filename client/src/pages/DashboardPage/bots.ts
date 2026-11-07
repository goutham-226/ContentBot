import { useOutletContext } from 'react-router';

export type Bot = {
  id: string;
  name: string;
  niches: string[]; // 1–3, chosen from a fixed list
  createdAt: number;
};

export type BotsContext = {
  bots: Bot[];
  addBot: (niches: string[]) => Bot;
};

// Shared with the panels rendered in DashboardPage's <Outlet>.
export function useBots(): BotsContext {
  return useOutletContext<BotsContext>();
}

// "Fitness", "Fitness & History", "Fitness, History & Science"
export function joinNiches(niches: string[]): string {
  if (niches.length <= 1) return niches.join('');
  return `${niches.slice(0, -1).join(', ')} & ${niches[niches.length - 1]}`;
}
