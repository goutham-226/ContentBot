export type IdentityPreset = {
  id: string;
  name: string;
  description: string;
};

// Video styles offered when creating a bot. "Choose your own" is added by
// the page after these. Each needs a unique id.
export const IDENTITY_PRESETS: IdentityPreset[] = [
  {
    id: 'peter-stewie',
    name: 'Peter & Stewie explain',
    description: 'Two cartoon characters banter: one asks the questions, the other explains the topic.',
  },
  {
    id: 'zackd-films',
    name: 'ZackD Films style',
    description: 'Short 3D-animated explainers that show exactly what happens, step by step.',
  },
  {
    id: 'retro-cartoon',
    name: 'Retro cartoon explainer',
    description: 'A vintage cartoon look with a cheerful narrator, like an old educational reel.',
  },
  {
    id: 'stick-figure',
    name: 'Stick figure',
    description: 'Simple hand-drawn stick figures that make ideas easy to follow.',
  },
  {
    id: 'skeleton',
    name: 'Skeleton',
    description: 'A deadpan skeleton presenter who breaks things down with dark humour.',
  },
  {
    id: 'human-ai-model',
    name: 'Human AI model',
    description: 'A realistic AI-generated presenter speaking straight to camera.',
  },
];

export const CUSTOM_NAME_MAX = 40;
export const CUSTOM_DESCRIPTION_MAX = 200;
