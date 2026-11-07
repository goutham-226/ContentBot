// Preset voices (Qwen3-TTS speakers). Ids are stored on the server
// (server/src/catalog.ts). A character keeps its voice in every video.
export const VOICES = [
  { id: 'Ryan', label: 'Ryan', description: 'Dynamic male, strong rhythm' },
  { id: 'Aiden', label: 'Aiden', description: 'Sunny American male, clear' },
  { id: 'Serena', label: 'Serena', description: 'Warm, gentle young female' },
  { id: 'Vivian', label: 'Vivian', description: 'Bright, slightly edgy female' },
  { id: 'Sohee', label: 'Sohee', description: 'Warm female, rich emotion' },
  { id: 'Ono_anna', label: 'Anna', description: 'Playful, light female' },
  { id: 'Uncle_fu', label: 'Uncle Fu', description: 'Seasoned male, low and mellow' },
  { id: 'Dylan', label: 'Dylan', description: 'Youthful male, natural' },
  { id: 'Eric', label: 'Eric', description: 'Lively male, slightly husky' },
];

export const DEFAULT_VOICES: [string, string] = ['Ryan', 'Aiden'];

// Presets that come with two characters.
export const DUO_PRESETS = new Set(['peter-stewie']);

export const voiceLabel = (id: string) => VOICES.find((v) => v.id === id)?.label ?? id;
