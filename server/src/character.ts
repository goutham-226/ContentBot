// Starting points for a bot's characters and its reference images. The user
// approves or rewrites the drafts before chatting, so these only need to be a
// good first guess. Keep the preset ids in sync with catalog.ts.
//
// Every preset describes ORIGINAL characters. Some preset names refer to real
// shows or creators, so prompts sent to models use `style` instead of the
// preset's name, and never name existing characters, shows or people.

type CharacterSeed = {
  name?: string; // single-character presets use the bot's name
  look: string;
  personality: string;
  voice: string;
};

type PresetSeed = {
  style: string; // what the models are told about the visual style
  characters: CharacterSeed[]; // 1 or 2
};

const SEEDS = new Map<string, PresetSeed>([
  ['peter-stewie', {
    style: 'Flat, bold-outline adult-animation TV cartoon style with simple shading. Original character designs, not from any existing show.',
    characters: [
      {
        name: 'Big Lou',
        look: 'A tall, burly cartoon dad with a scruffy red beard, a backwards baseball cap and a too-small Hawaiian shirt.',
        personality: 'Big-hearted and confidently wrong about everything; easily distracted by snacks.',
        voice: 'A booming, goofy American dad voice with a big belly laugh.',
      },
      {
        name: 'Baby Percival',
        look: 'A tiny cartoon toddler genius with round glasses, a bow tie and a sweater vest, riding a little scooter.',
        personality: 'Brilliant, theatrical and sarcastic; always corrects Big Lou and explains things properly.',
        voice: 'A crisp, precise, theatrical child voice with very proper diction.',
      },
    ],
  }],
  ['zackd-films', {
    style: 'Short, realistic 3D animation with x-ray cutaways that show what happens inside. Original look and characters.',
    characters: [{
      look: 'Everyday 3D-animated people in realistic settings, with x-ray cutaways that show what happens inside.',
      personality: 'Curious and a little dramatic: always asking “what happens if…?”',
      voice: 'Quick, punchy narration over the action.',
    }],
  }],
  ['retro-cartoon', {
    style: 'A 1920s silent-era cartoon in black and white only: hand-inked lines, solid black and white shapes with flat grey tones, bouncy looping animation, flickering film grain, scratches, dust specks and a vignette, like an old cartoon reel. The star is an imaginary cartoon character, never a human. Never any colour.',
    characters: [{
      look: 'An imaginary character that looks like it is from a 1920s cartoon, not a human, drawn in black and white ink. It looks the same in every shot.',
      personality: 'Cheerful, bouncy and endlessly optimistic.',
      voice: 'An old-time newsreel announcer.',
    }],
  }],
  ['stick-figure', {
    style: 'Simple hand-drawn stick figures in marker on a white background, with handwritten labels.',
    characters: [{
      look: 'A simple stick figure on a white background, drawn with quick marker lines and handwritten labels.',
      personality: 'Dry and to the point.',
      voice: 'Calm, deadpan narration.',
    }],
  }],
  ['skeleton', {
    style: 'A clean cartoon look with a deadpan skeleton presenter.',
    characters: [{
      look: 'A grinning cartoon skeleton in a sharp suit, standing in front of a chalkboard.',
      personality: 'Deadpan, with dark humour and surprising warmth.',
      voice: 'Slow, dry delivery with well-timed pauses.',
    }],
  }],
  ['human-ai-model', {
    style: 'Photorealistic, softly lit studio video with a fictional presenter.',
    characters: [{
      look: 'A realistic, fictional presenter, neat and camera-ready, in a clean, softly lit studio.',
      personality: 'A friendly expert who never talks down to viewers.',
      voice: 'Clear and warm, straight to camera.',
    }],
  }],
]);

// The visual style to give models: never the preset's (possibly trademarked) name.
export function styleFor(presetId: string | null, identityName: string, identityDescription: string): string {
  const seed = presetId ? SEEDS.get(presetId) : undefined;
  if (seed) return seed.style;
  return identityDescription ? `${identityName}: ${identityDescription}` : identityName;
}

export const ORIGINALITY_RULE =
  'All characters are original. Never name, depict or imitate existing copyrighted characters, shows, or real creators and celebrities, including their voices.';

type DraftInput = {
  name: string;
  niches: string[];
  presetId: string | null;
  identityName: string;
  identityDescription: string;
};

function format(seed: CharacterSeed | undefined, name: string, input: DraftInput): string {
  return [
    `Name: ${seed?.name ?? name}`,
    `Look: ${seed?.look ?? (input.identityDescription || `In the style of “${input.identityName}”, based on your images.`)}`,
    `Personality: ${seed?.personality ?? 'Describe how your character thinks and acts.'}`,
    `Voice: ${seed?.voice ?? 'Describe how your character talks.'}`,
    `Talks about: ${input.niches.join(', ')}`,
  ].join('\n');
}

// Returns the first character's draft and the second's ('' when the preset has one).
export function draftCharacters(input: DraftInput): [string, string] {
  const seed = input.presetId ? SEEDS.get(input.presetId) : undefined;
  const [first, second] = seed?.characters ?? [];
  return [format(first, input.name, input), second ? format(second, input.name, input) : ''];
}
