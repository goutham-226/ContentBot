// Rewrites character drafts from the user's plain-language instructions, so
// they can say "make him a raccoon" instead of editing the fields by hand.
import { ORIGINALITY_RULE } from './character.ts';
import { generateText, LLM_CHAIN, withFallback } from './replicate.ts';

export const INSTRUCTIONS_MAX = 1000;

export async function reviseCharacters(
  current: { text: string; second: string },
  instructions: string,
  limit: number,
): Promise<{ text: string; second: string }> {
  const prompt = `You edit the character descriptions for a short-form video channel.

Character 1:
${current.text}

Character 2:
${current.second || '(none)'}

The user wants these changes:
${instructions}

Rewrite the characters to make exactly those changes. Keep everything the user didn't ask to change, word for word where possible.
Keep the same line format ("Name: …", "Look: …", "Personality: …", "Voice: …", "Talks about: …"). Make "Look" concrete enough to draw the character the same way every time.
Add a second character only if the user asks for one; remove it if they ask. ${ORIGINALITY_RULE}
Each character must be under ${limit} characters.

Reply with JSON only: {"text": "character 1", "second": "character 2, or an empty string"}`;
  return withFallback(LLM_CHAIN, 'rewriting the character', async (model) => {
    const answer = await generateText(prompt, 1500, model);
    const start = answer.indexOf('{');
    const end = answer.lastIndexOf('}');
    const parsed: unknown = start !== -1 && end > start ? JSON.parse(answer.slice(start, end + 1)) : null;
    const { text, second } = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
    if (typeof text !== 'string' || !text.trim()) throw new Error(`${model} didn’t return a usable character.`);
    return {
      text: text.trim().slice(0, limit),
      second: typeof second === 'string' ? second.trim().slice(0, limit) : '',
    };
  });
}
