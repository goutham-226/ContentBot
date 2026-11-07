// Robot avatar colours. Ids are stored on the server (server/src/catalog.ts).
export const BOT_COLORS = [
  { id: 'blue', label: 'Blue', hex: '#4a7cf7' },
  { id: 'purple', label: 'Purple', hex: '#9b72f2' },
  { id: 'pink', label: 'Pink', hex: '#ef6fae' },
  { id: 'red', label: 'Red', hex: '#f0675c' },
  { id: 'orange', label: 'Orange', hex: '#f39a45' },
  { id: 'yellow', label: 'Yellow', hex: '#f2c94c' },
  { id: 'green', label: 'Green', hex: '#43c27f' },
  { id: 'teal', label: 'Teal', hex: '#3cb8c8' },
];

export const DEFAULT_BOT_COLOR = 'blue';

export function botColorHex(id: string): string {
  return (BOT_COLORS.find((c) => c.id === id) ?? BOT_COLORS[0]).hex;
}
