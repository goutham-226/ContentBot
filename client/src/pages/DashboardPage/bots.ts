import { useOutletContext } from 'react-router';

export type Bot = {
  id: string;
  name: string;
  niche: string;
  createdAt: number;
};

export type BotsContext = {
  bots: Bot[];
  addBot: (niche: string) => Bot;
};

// Shared with the panels rendered in DashboardPage's <Outlet>.
export function useBots(): BotsContext {
  return useOutletContext<BotsContext>();
}
