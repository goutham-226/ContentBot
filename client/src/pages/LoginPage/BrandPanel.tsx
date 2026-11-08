import type { CSSProperties, ReactNode } from 'react';

// Line icons for what the bots make, drawn in currentColor on a 24×24 grid.
const ICONS: Record<string, ReactNode> = {
  play: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l5.5-3.5z" fill="currentColor" stroke="none" />
    </>
  ),
  camera: (
    <>
      <rect x="3" y="7" width="12" height="10" rx="2" />
      <path d="M15 10.5l6-3.5v10l-6-3.5" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  spark: <path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z" fill="currentColor" stroke="none" />,
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7.5 3c0 5.4-7.5 10-7.5 10z" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  music: (
    <>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
  trend: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  twins: (
    <>
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" />
    </>
  ),
};

type Float = { icon: keyof typeof ICONS; x: number; y: number; size: number; tone: 'accent' | 'light' | 'white'; delay: number };

// Spread around the edges, clear of the logo in the middle.
const FLOATS: Float[] = [
  { icon: 'play', x: 8, y: 10, size: 46, tone: 'accent', delay: 0 },
  { icon: 'spark', x: 30, y: 6, size: 22, tone: 'white', delay: -3 },
  { icon: 'heart', x: 74, y: 9, size: 34, tone: 'light', delay: -6 },
  { icon: 'music', x: 88, y: 26, size: 40, tone: 'accent', delay: -2 },
  { icon: 'chat', x: 12, y: 34, size: 32, tone: 'light', delay: -8 },
  { icon: 'twins', x: 84, y: 50, size: 52, tone: 'light', delay: -4 },
  { icon: 'mic', x: 6, y: 58, size: 38, tone: 'white', delay: -10 },
  { icon: 'trend', x: 24, y: 78, size: 36, tone: 'accent', delay: -5 },
  { icon: 'camera', x: 70, y: 76, size: 44, tone: 'accent', delay: -9 },
  { icon: 'spark', x: 90, y: 88, size: 26, tone: 'light', delay: -1 },
  { icon: 'heart', x: 46, y: 90, size: 24, tone: 'white', delay: -7 },
  { icon: 'spark', x: 60, y: 22, size: 16, tone: 'accent', delay: -11 },
];

export default function BrandPanel() {
  return (
    <aside className="brand-panel">
      <div className="brand-floats" aria-hidden="true">
        {FLOATS.map((f, i) => (
          <svg
            key={i}
            className={`brand-float brand-float--${f.tone}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              '--x': `${f.x}%`, '--y': `${f.y}%`, '--size': `${f.size}px`,
              '--delay': `${f.delay}s`, '--dur': `${14 + (i % 4) * 3}s`,
            } as CSSProperties}
          >
            {ICONS[f.icon]}
          </svg>
        ))}
      </div>
      <div className="brand">
        <img src="/logo.svg" alt="" className="brand-logo" />
        <span className="brand-name">Twinfluencer</span>
      </div>
    </aside>
  );
}
