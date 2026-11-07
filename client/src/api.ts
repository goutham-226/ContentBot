import type { Bot, BotMessage, Run } from './pages/DashboardPage/bots';

export type SessionUser = { username: string; email: string; creditsCents: number };

// What the server needs to know about the chosen identity.
export type IdentityInput = { presetId: string } | { name: string; description: string };

export class UnauthorizedError extends Error {}

const SERVER_UNREACHABLE = 'Can’t reach the server right now. Please try again in a moment.';

// fetch wrapper: same-origin cookies are sent automatically; errors carry the server's message.
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error(SERVER_UNREACHABLE);
  }
  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => null);
  if (data === null) throw new Error(SERVER_UNREACHABLE);
  if (res.status === 401) throw new UnauthorizedError('Please log in.');
  if (!res.ok) {
    const message =
      typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'Something went wrong. Please try again.';
    throw new Error(message);
  }
  return data as T;
}

export async function getMe(): Promise<SessionUser | null> {
  try {
    const { user } = await request<{ user: SessionUser }>('/api/auth/me');
    return user;
  } catch (err) {
    if (err instanceof UnauthorizedError) return null;
    throw err;
  }
}

export function logout(): Promise<void> {
  return request<void>('/api/auth/logout', { method: 'POST' });
}

export async function listBots(): Promise<Bot[]> {
  const { bots } = await request<{ bots: Bot[] }>('/api/bots');
  return bots;
}

export type NewBotInput = {
  name: string;
  color: string;
  niches: string[];
  identity: IdentityInput;
  images: File[];
};

export async function createBot({ images, ...data }: NewBotInput): Promise<Bot> {
  const form = new FormData();
  form.append('data', JSON.stringify(data));
  for (const file of images) form.append('images', file);
  const { bot } = await request<{ bot: Bot }>('/api/bots', { method: 'POST', body: form });
  return bot;
}

export function deleteBot(botId: string): Promise<void> {
  return request<void>(`/api/bots/${botId}`, { method: 'DELETE' });
}

export async function saveCharacter(botId: string, text: string, second: string): Promise<Bot> {
  const { bot } = await request<{ bot: Bot }>(`/api/bots/${botId}/character`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, second }),
  });
  return bot;
}

export function getThread(botId: string): Promise<{ messages: BotMessage[]; runs: Run[] }> {
  return request(`/api/bots/${botId}/thread`);
}

type Started = { message: BotMessage; run: Run };

function postJson<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// An idea for the bot to research, or "surprise me".
export function sendIdea(botId: string, idea: { body: string } | { surprise: true }): Promise<Started> {
  return postJson(`/api/bots/${botId}/messages`, idea);
}

export type IdentityAsset = 'character' | 'character_sheet' | 'channel_avatar' | 'channel_banner';

export function regenerateIdentity(botId: string, targets: IdentityAsset[], notes: string): Promise<Started> {
  return postJson(`/api/bots/${botId}/identity/regenerate`, { targets, notes });
}

export function cancelRun(botId: string, runId: string): Promise<{ run: Run }> {
  return request(`/api/bots/${botId}/runs/${runId}/cancel`, { method: 'POST' });
}

export function approveResearch(botId: string, runId: string, notes: string): Promise<Started> {
  return postJson(`/api/bots/${botId}/runs/${runId}/approve`, { notes });
}

export function reresearch(botId: string, runId: string, notes: string): Promise<Started> {
  return postJson(`/api/bots/${botId}/runs/${runId}/reresearch`, { notes });
}
