// What the server accepts when a bot is created. Keep in sync with
// client/src/pages/DashboardPage/niches.ts and identities.ts.

export const NICHES = new Set([
  'Personal finance', 'Investing', 'Crypto', 'Startups', 'Entrepreneurship', 'Marketing', 'Leadership', 'Careers',
  'Artificial intelligence', 'Programming', 'Gadgets', 'Cybersecurity',
  'Science', 'Space', 'Psychology', 'History', 'Philosophy', 'Education',
  'Fitness', 'Nutrition', 'Mental health', 'Mindfulness', 'Self-improvement', 'Productivity',
  'Fantasy', 'Science fiction', 'Mystery & thriller', 'Romance', 'Horror', 'Comics & graphic novels', 'Anime & manga', 'Poetry', 'Art & design',
  'Movies & TV', 'Music', 'Gaming', 'Comedy',
  'Travel', 'Food & cooking', 'Style & fashion', 'Beauty', 'Home & garden', 'Parenting & family', 'Relationships', 'Pets',
  'Football', 'Basketball', 'Motorsport', 'Outdoor & adventure', 'Cars',
  'Politics', 'Current affairs', 'True crime', 'Law',
]);

export const IDENTITY_PRESETS = new Map([
  ['peter-stewie', { name: 'Peter & Stewie explain', description: 'Two cartoon characters banter: one asks the questions, the other explains the topic.' }],
  ['zackd-films', { name: 'ZackD Films style', description: 'Short 3D-animated explainers that show exactly what happens, step by step.' }],
  ['retro-cartoon', { name: 'Retro cartoon explainer', description: 'A vintage cartoon look with a cheerful narrator, like an old educational reel.' }],
  ['stick-figure', { name: 'Stick figure', description: 'Simple hand-drawn stick figures that make ideas easy to follow.' }],
  ['skeleton', { name: 'Skeleton', description: 'A deadpan skeleton presenter who breaks things down with dark humour.' }],
  ['human-ai-model', { name: 'Human AI model', description: 'A realistic AI-generated presenter speaking straight to camera.' }],
]);

export const MAX_NICHES = 3;
export const CUSTOM_NAME_MAX = 40;
export const CUSTOM_DESCRIPTION_MAX = 200;
export const MAX_IMAGES = 10;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Robot avatar colours. Keep in sync with client/src/pages/DashboardPage/botColors.ts.
export const BOT_COLORS = new Set(['blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'teal']);
export const BOT_NAME_MAX = 40;
export const MESSAGE_MAX = 4000;

// Qwen3-TTS preset speakers. Keep in sync with client/src/pages/DashboardPage/voices.ts
// and the bots_voice_check constraint (db/migrations/010_voices.sql).
export const VOICES = new Map([
  ['Ryan', 'Dynamic male voice with strong rhythmic drive'],
  ['Aiden', 'Sunny American male voice with a clear midrange'],
  ['Serena', 'Warm, gentle young female voice'],
  ['Vivian', 'Bright, slightly edgy young female voice'],
  ['Sohee', 'Warm female voice with rich emotion'],
  ['Ono_anna', 'Playful female voice with a light, nimble timbre'],
  ['Uncle_fu', 'Seasoned male voice with a low, mellow timbre'],
  ['Dylan', 'Youthful male voice with a clear, natural timbre'],
  ['Eric', 'Lively male voice with a slightly husky brightness'],
]);
export const DEFAULT_VOICES = ['Ryan', 'Aiden'] as const;
