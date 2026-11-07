// Flat vector scenes for the About page. Colours come from CSS classes in
// AboutPage.css (f-* = fill, s-* = stroke) so they follow the theme tokens.

type Pt = { x: number; y: number };

function Spark({ x, y, s, className = 'f-ink' }: Pt & { s: number; className?: string }) {
  const k = s * 0.28;
  return (
    <path
      className={className}
      d={`M${x} ${y - s}L${x + k} ${y - k}L${x + s} ${y}L${x + k} ${y + k}L${x} ${y + s}L${x - k} ${y + k}L${x - s} ${y}L${x - k} ${y - k}Z`}
    />
  );
}

// Head centred on (x, y); torso extends ~92 units below.
function Person({ x, y }: Pt) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect className="f-skin" x="-7" y="14" width="14" height="14" rx="3" />
      <path className="f-accent" d="M-36 92v-38c0-26 18-30 36-30s36 4 36 30v38z" />
      <path className="s-bg w2" d="M-9 25l9 9 9-9" />
      <circle className="f-skin" r="22" />
      <path className="f-hair" d="M-23 3C-25-19-9-27 1-26c15 1 25 12 22 29-4-10-12-15-23-15S-19-7-23 3z" />
      <circle className="f-face" cx="-8" cy="4" r="2.4" />
      <circle className="f-face" cx="8" cy="4" r="2.4" />
      <path className="s-face" d="M-7 11q7 6 14 0" />
    </g>
  );
}

// The Twinfluencer bot: its eyes are the logo's twin rings.
function Bot({ x, y }: Pt) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="float">
        <line className="s-accent" x1="0" y1="-30" x2="0" y2="-42" />
        <Spark x={0} y={-50} s={8} />
        <rect className="f-accent" x="-40" y="-8" width="8" height="16" rx="4" />
        <rect className="f-accent" x="32" y="-8" width="8" height="16" rx="4" />
        <rect className="s-accent f-panel" x="-34" y="-30" width="68" height="56" rx="18" />
        <rect className="f-screen" x="-24" y="-19" width="48" height="32" rx="10" />
        <circle className="s-ink" cx="-7" cy="-4" r="7" />
        <circle className="s-accent" cx="7" cy="-4" r="7" />
        <path className="s-accent w2" d="M-6 7q6 4 12 0" />
        <rect className="s-strong w2 f-panel" x="-22" y="32" width="44" height="24" rx="10" />
      </g>
    </g>
  );
}

type CharacterVariant = 'bun' | 'bot' | 'glasses';

function Character({ cx, ty, variant }: { cx: number; ty: number; variant: CharacterVariant }) {
  const shoulders = `M${cx - 20} ${ty + 68}c0-14 9-20 20-20s20 6 20 20z`;
  return (
    <g>
      <rect className="s-strong w2 f-panel" x={cx - 28} y={ty} width="56" height="72" rx="12" />
      {variant === 'bot' ? (
        <>
          <line className="s-accent w2" x1={cx} y1={ty + 16} x2={cx} y2={ty + 9} />
          <circle className="f-ink" cx={cx} cy={ty + 7} r="2.5" />
          <rect className="s-accent w2 f-screen" x={cx - 15} y={ty + 16} width="30" height="26" rx="9" />
          <circle className="s-ink w2" cx={cx - 4} cy={ty + 29} r="4" />
          <circle className="s-accent w2" cx={cx + 4} cy={ty + 29} r="4" />
          <path className="f-strong" d={shoulders} />
        </>
      ) : (
        <>
          <path className="f-accent" d={shoulders} />
          {variant === 'bun' && <circle className="f-hair" cx={cx} cy={ty + 12} r="6" />}
          <circle className="f-skin" cx={cx} cy={ty + 28} r="13" />
          {variant === 'bun' ? (
            <>
              <path className="f-hair" d={`M${cx - 13} ${ty + 27}c0-10 6-14 13-14s13 4 13 14c-4-5-8-7-13-7s-9 2-13 7z`} />
              <circle className="f-face" cx={cx - 5} cy={ty + 29} r="1.8" />
              <circle className="f-face" cx={cx + 5} cy={ty + 29} r="1.8" />
            </>
          ) : (
            <>
              <path className="f-hair" d={`M${cx - 13} ${ty + 25}c0-9 5-12 13-12s13 3 13 12z`} />
              <circle className="s-face" cx={cx - 5} cy={ty + 29} r="4.5" />
              <circle className="s-face" cx={cx + 5} cy={ty + 29} r="4.5" />
            </>
          )}
        </>
      )}
    </g>
  );
}

export function HeroArt() {
  return (
    <svg className="ill" viewBox="0 0 480 300" role="img" aria-label="A person at a laptop working alongside a Twinfluencer bot that suggests ideas">
      <ellipse className="f-blob" cx="240" cy="160" rx="220" ry="125" />
      <Spark x={60} y={64} s={9} />
      <Spark x={424} y={56} s={7} className="f-accent" />
      <Spark x={446} y={214} s={5} className="f-muted" />
      <Spark x={36} y={190} s={5} className="f-accent" />

      <path className="s-accent w2 dash" d="M322 92Q290 40 222 92" />
      <rect className="s-strong w2 f-panel" x="250" y="22" width="72" height="42" rx="12" />
      <circle className="f-accent" cx="270" cy="40" r="8" />
      <rect className="f-muted" x="266" y="49" width="8" height="5" rx="1.5" />
      <rect className="f-muted" x="284" y="34" width="28" height="5" rx="2.5" />
      <rect className="f-strong" x="284" y="44" width="20" height="5" rx="2.5" />

      <Person x={190} y={112} />

      <rect className="f-strong" x="70" y="226" width="340" height="10" rx="5" />
      <rect className="f-strong" x="96" y="236" width="8" height="48" rx="3" />
      <rect className="f-strong" x="376" y="236" width="8" height="48" rx="3" />
      <rect className="s-strong w2 f-panel" x="130" y="164" width="120" height="62" rx="8" />
      <circle className="s-ink w2" cx="184" cy="195" r="9" />
      <circle className="s-accent w2" cx="196" cy="195" r="9" />

      <rect className="f-accent" x="82" y="208" width="44" height="18" rx="3" />
      <rect className="f-muted" x="88" y="192" width="36" height="16" rx="3" />
      <rect className="f-ink" x="84" y="178" width="40" height="14" rx="3" />

      <ellipse className="f-shadow" cx="360" cy="200" rx="34" ry="6" />
      <Bot x={360} y={120} />
    </svg>
  );
}

export function NicheArt() {
  return (
    <svg className="ill" viewBox="0 0 320 200" role="img" aria-label="A person picking one niche from a grid of topics">
      <ellipse className="f-blob" cx="160" cy="110" rx="150" ry="88" />
      <Spark x={300} y={186} s={6} className="f-accent" />
      <Spark x={24} y={30} s={6} />

      <Person x={70} y={84} />
      <line className="s-skin arm" x1="98" y1="134" x2="146" y2="86" />
      <line className="s-accent sleeve" x1="98" y1="134" x2="114" y2="118" />
      <circle className="f-skin" cx="148" cy="84" r="7" />

      {/* Selected niche */}
      <rect className="s-accent f-soft" x="158" y="24" width="60" height="60" rx="14" />
      <path className="f-accent" d="M174 44q7-4 14 0v22q-7-4-14 0zM188 44q7-4 14 0v22q-7-4-14 0z" />
      <circle className="f-accent" cx="218" cy="24" r="10" />
      <path className="s-ink w2" d="M213 24l3.5 3.5 6.5-7" />

      <rect className="s-strong w2 f-panel" x="230" y="24" width="60" height="60" rx="14" />
      <rect className="f-muted" x="246" y="51" width="28" height="6" rx="3" />
      <rect className="f-muted" x="242" y="44" width="8" height="20" rx="3" />
      <rect className="f-muted" x="270" y="44" width="8" height="20" rx="3" />

      <rect className="s-strong w2 f-panel" x="158" y="104" width="60" height="60" rx="14" />
      <circle className="s-muted" cx="188" cy="134" r="13" />
      <circle className="f-muted" cx="188" cy="134" r="5" />

      <rect className="s-strong w2 f-panel" x="230" y="104" width="60" height="60" rx="14" />
      <path className="f-muted" d="M264 118l-13 18h9l-4 14 14-19h-9z" />
    </svg>
  );
}

export function ReadArt() {
  return (
    <svg className="ill" viewBox="0 0 320 200" role="img" aria-label="The bot scanning a stack of top-rated articles">
      <ellipse className="f-blob" cx="160" cy="110" rx="150" ry="88" />
      <Spark x={290} y={30} s={6} className="f-accent" />

      <polygon className="f-beam" points="240,92 128,76 128,174" />
      {/* Stack of articles, front one showing a header image, title and text lines */}
      <rect className="f-strong" x="40" y="74" width="84" height="100" rx="8" transform="rotate(-9 82 124)" />
      <rect className="f-muted" x="40" y="74" width="84" height="100" rx="8" transform="rotate(-4 82 124)" />
      <rect className="s-strong w2 f-panel" x="40" y="74" width="84" height="100" rx="8" />
      <rect className="f-soft" x="48" y="82" width="68" height="24" rx="4" />
      <rect className="f-ink" x="48" y="114" width="56" height="6" rx="3" />
      <rect className="f-muted" x="48" y="127" width="68" height="4" rx="2" />
      <rect className="f-muted" x="48" y="136" width="62" height="4" rx="2" />
      <rect className="f-muted" x="48" y="145" width="66" height="4" rx="2" />
      <rect className="f-muted" x="48" y="154" width="40" height="4" rx="2" />
      <circle className="f-accent" cx="122" cy="76" r="13" />
      <Spark x={122} y={76} s={7} />

      <rect className="f-ink" x="150" y="104" width="12" height="15" rx="2" transform="rotate(-12 156 111)" />
      <rect className="f-muted" x="176" y="122" width="10" height="13" rx="2" transform="rotate(10 181 128)" />
      <rect className="f-ink" x="160" y="142" width="9" height="11" rx="2" transform="rotate(-6 164 147)" />

      <ellipse className="f-shadow" cx="244" cy="176" rx="30" ry="5" />
      <Bot x={244} y={96} />
    </svg>
  );
}

export function IdeasArt() {
  return (
    <svg className="ill" viewBox="0 0 320 200" role="img" aria-label="The bot handing human-inspired idea cards to a person">
      <defs>
        <marker id="ill-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
          <path className="s-accent w2" d="M1 1L7 4L1 7" />
        </marker>
      </defs>
      <ellipse className="f-blob" cx="160" cy="110" rx="150" ry="88" />
      <Spark x={300} y={36} s={6} className="f-accent" />
      <Spark x={26} y={36} s={5} />

      {/* Lightbulb */}
      <path className="s-accent" d="M162 24v-8M145 31l-6-6M179 31l6-6M138 48h-8M186 48h8" />
      <circle className="f-accent" cx="162" cy="48" r="17" />
      <path className="s-ink w2" d="M157 50l5 5 5-5" />
      <rect className="f-muted" x="154" y="64" width="16" height="6" rx="2" />
      <rect className="f-strong" x="156" y="71" width="12" height="5" rx="2" />

      <Bot x={66} y={104} />
      <Person x={256} y={84} />

      <g transform="translate(124 124) rotate(-12)">
        <rect className="s-strong w2 f-panel" x="-17" y="-21" width="34" height="42" rx="6" />
        <circle className="f-accent" cy="-8" r="5" />
        <rect className="f-muted" x="-10" y="4" width="20" height="4" rx="2" />
        <rect className="f-strong" x="-10" y="11" width="13" height="4" rx="2" />
      </g>
      <g transform="translate(162 134)">
        <rect className="s-strong w2 f-panel" x="-17" y="-21" width="34" height="42" rx="6" />
        <Spark x={0} y={-8} s={6} className="f-accent" />
        <rect className="f-muted" x="-10" y="4" width="20" height="4" rx="2" />
        <rect className="f-strong" x="-10" y="11" width="13" height="4" rx="2" />
      </g>
      <g transform="translate(200 124) rotate(12)">
        <rect className="s-accent w2 f-panel" x="-17" y="-21" width="34" height="42" rx="6" />
        <path className="f-accent" transform="translate(0 -10) scale(0.75)" d="M0 0c-3-5-11-4-11 2 0 5 8 9 11 11 3-2 11-6 11-11 0-6-8-7-11-2z" />
        <rect className="f-muted" x="-10" y="4" width="20" height="4" rx="2" />
        <rect className="f-strong" x="-10" y="11" width="13" height="4" rx="2" />
      </g>

      <path className="s-accent w2 dash" d="M104 172Q162 198 214 172" markerEnd="url(#ill-arrow)" />
    </svg>
  );
}

export function IdentityArt() {
  const sliders = [
    { y: 128, fill: 92 },
    { y: 150, fill: 48 },
    { y: 172, fill: 110 },
  ];
  return (
    <svg className="ill" viewBox="0 0 480 220" role="img" aria-label="A person designing their channel profile and choosing characters">
      <ellipse className="f-blob" cx="240" cy="115" rx="225" ry="100" />
      <Spark x={30} y={34} s={7} className="f-accent" />
      <Spark x={466} y={204} s={5} />

      <Person x={74} y={96} />
      <line className="s-skin arm" x1="104" y1="146" x2="138" y2="118" />
      <line className="s-accent sleeve" x1="104" y1="146" x2="118" y2="134" />
      <circle className="f-skin" cx="140" cy="116" r="7" />

      {/* Channel profile */}
      <rect className="s-strong w2 f-panel" x="150" y="26" width="170" height="168" rx="16" />
      <path className="f-soft" d="M151 42a15 15 0 0 1 15-15h138a15 15 0 0 1 15 15v32H151z" />
      <circle className="s-bg w4 f-screen" cx="186" cy="76" r="21" />
      <circle className="s-ink w2" cx="181" cy="76" r="7" />
      <circle className="s-accent w2" cx="191" cy="76" r="7" />
      <rect className="f-ink" x="216" y="84" width="78" height="8" rx="4" />
      <rect className="f-muted" x="216" y="98" width="50" height="6" rx="3" />
      {sliders.map((s) => (
        <g key={s.y}>
          <rect className="f-strong" x="168" y={s.y - 2} width="134" height="4" rx="2" />
          <rect className="f-accent" x="168" y={s.y - 2} width={s.fill} height="4" rx="2" />
          <circle className="s-accent w2 f-ink" cx={168 + s.fill} cy={s.y} r="7" />
        </g>
      ))}

      {/* Pencil drawn over the card */}
      <line className="s-accent pencil" x1="140" y1="116" x2="160" y2="92" />
      <circle className="f-ink" cx="162" cy="89" r="3" />

      {/* Characters */}
      <Character cx={366} ty={24} variant="bun" />
      <Character cx={430} ty={24} variant="bot" />
      <Character cx={366} ty={112} variant="glasses" />
      <rect className="s-accent w2 dash" x="402" y="112" width="56" height="72" rx="12" />
      <path className="s-accent" d="M430 136v24M418 148h24" />
    </svg>
  );
}
