// Premium videos (Seedance 2.5) are only for bots whose characters aren't
// realistic humans: Seedance rejects real-looking people. The answer is cached
// in bots.premium_eligible and cleared whenever the characters change.
import { pool } from './db.ts';
import { generateText, LLM_CHAIN, withFallback } from './replicate.ts';

const ALWAYS_HUMAN = new Set(['human-ai-model']);

export async function isPremiumEligible(botId: string): Promise<boolean> {
  const { rows } = await pool.query<{
    premium_eligible: boolean | null; identity_preset: string | null; identity_name: string;
    identity_description: string; character: string; character2: string;
  }>(
    `SELECT premium_eligible, identity_preset, identity_name, identity_description, character, character2
       FROM bots WHERE id = $1`,
    [botId],
  );
  const bot = rows[0];
  if (!bot) return false;
  if (bot.premium_eligible !== null) return bot.premium_eligible;
  const eligible = !ALWAYS_HUMAN.has(bot.identity_preset ?? '') && !(await looksHuman(bot));
  await pool.query('UPDATE bots SET premium_eligible = $2 WHERE id = $1', [botId, eligible]);
  return eligible;
}

async function looksHuman(bot: { identity_name: string; identity_description: string; character: string; character2: string }) {
  const prompt = `Does any of these video characters look like a realistic, photographic human being?
Answer HUMAN if any character would be drawn as a real-looking person (photoreal, live-action or lifelike 3D).
Answer NOT_HUMAN if every character is clearly non-realistic: an animal, creature, robot, object, skeleton, or a cartoon, anime, clay, toy or other stylised figure, even if it is a person.

Visual style: ${bot.identity_name}. ${bot.identity_description}
Character 1: ${bot.character || '(none)'}
${bot.character2 ? `Character 2: ${bot.character2}` : ''}

Reply with exactly one word: HUMAN or NOT_HUMAN.`;
  return withFallback(LLM_CHAIN, 'checking premium eligibility', async (model) => {
    const answer = (await generateText(prompt, 16, model)).toUpperCase();
    if (answer.includes('NOT_HUMAN')) return false;
    if (answer.includes('HUMAN')) return true;
    throw new Error(`Unclear answer: ${answer.slice(0, 40)}`);
  });
}
