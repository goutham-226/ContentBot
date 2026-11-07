import { useOutletContext } from 'react-router';
import type { NewBotInput } from '../../api';

// Shapes returned by /api/bots.
export type ChannelIdentity = {
  presetId: string | null;
  name: string;
  description: string;
  custom: boolean; // true when the user wrote their own instead of picking a preset
};

export type BotImage = {
  id: string;
  name: string;
  url: string; // served by the API, only to the bot's owner
  source: { url: string; creator: string; license: string } | null; // set when found online
  aiGenerated: boolean; // part of the bot's permanent AI identity pack
  asset: 'character' | 'character_sheet' | 'channel_avatar' | 'channel_banner' | null;
};

export type BotCharacter = {
  text: string;
  second: string; // optional second character; '' when there's one
  approved: boolean; // chat opens once the user approves (or edits) the draft
};

export type Bot = {
  id: string;
  name: string; // chosen by the user, 1–40 characters
  color: string; // robot avatar colour id, see botColors.ts
  niches: string[]; // 1–3, chosen from a fixed list
  identity: ChannelIdentity;
  images: BotImage[]; // supporting images for the identity; at least 1 when custom
  character: BotCharacter;
  createdAt: string;
};

export type BotMessage = {
  id: string;
  role: 'user' | 'bot';
  body: string;
  createdAt: string;
};

export type RunStep = {
  id: string;
  kind: 'think' | 'search' | 'read' | 'book' | 'write' | 'image' | 'audio' | 'video' | 'error';
  title: string;
  detail: string;
  createdAt: string;
};

export type RunMedia = { id: string; kind: 'image' | 'audio' | 'video'; label: string; url: string };

export type Findings = {
  topic: string;
  approach: string;
  takeaways: string[];
  whyTheyWorked: string;
  bookInsights: string[];
  sources: { title: string; url: string | null; source: string; points: number | null; kind: 'article' | 'headline' | 'book' }[];
};

export type Production = {
  title: string;
  summary?: string;
  ideas?: { title: string; hook: string }[];
  script?: string;
  voiceover?: string;
};

export type Run = {
  id: string;
  messageId: string | null;
  parentRunId: string | null;
  kind: 'character' | 'research' | 'production';
  status: 'queued' | 'running' | 'awaiting_approval' | 'done' | 'failed' | 'canceled';
  error: string | null;
  result: Findings | Production | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  archived: boolean; // research, scripts and storyboards are cleared after a week unused
  chargedCents: number; // charged so far, part by part
  steps: RunStep[];
  media: RunMedia[];
};

export type BotsContext = {
  bots: Bot[];
  loading: boolean;
  addBot: (input: NewBotInput) => Promise<Bot>;
  removeBot: (botId: string) => Promise<void>;
  approveCharacter: (botId: string, text: string, second: string) => Promise<void>;
  refreshBots: () => Promise<void>;
  refreshBalance: () => Promise<void>;
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
