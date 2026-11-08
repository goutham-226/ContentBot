import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Findings, Production, Run, RunStep } from './bots';

const ACTIVE = new Set<Run['status']>(['queued', 'running']);

function formatDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

const STEP_ICONS: Record<RunStep['kind'], string> = {
  think: '✦', search: '⌕', read: '📄', book: '📚', write: '✎', image: '🖼', audio: '🎙', video: '🎬', error: '⚠',
};

const VERBS: Record<Run['kind'], [string, string]> = {
  character: ['Drawing your character', 'Drew your character'],
  research: ['Researching', 'Researched'],
  production: ['Making your video', 'Made your video'],
};

// Like Claude's thinking: open and live while working, collapsed to a
// one-line summary once done.
function Thinking({ run, onCancel }: { run: Run; onCancel: () => Promise<void> }) {
  const [canceling, setCanceling] = useState(false);
  const active = ACTIVE.has(run.status);
  const [open, setOpen] = useState(active);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  // Fold away when the run finishes.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setOpen(false);
  }

  const start = Date.parse(run.startedAt ?? run.createdAt);
  const end = run.finishedAt ? Date.parse(run.finishedAt) : now;
  const [doing, done] = VERBS[run.kind];
  const label =
    run.status === 'queued'
      ? 'Waiting to start…'
      : active
        ? `${doing}… ${formatDuration(end - start)}`
        : run.status === 'failed'
          ? `Stopped after ${formatDuration(end - start)}`
          : run.status === 'canceled'
            ? `Canceled after ${formatDuration(end - start)}`
          : `${done} for ${formatDuration(end - start)}`;

  if (run.steps.length === 0 && !active) return null;

  return (
    <div className={`thinking ${active ? 'thinking--active' : ''}`}>
      <button type="button" className="thinking-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {active && <span className="thinking-spinner" aria-hidden="true" />}
        <span>{label}</span>
        <span className="thinking-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {active && (
        <button
          type="button"
          className="thinking-cancel"
          disabled={canceling}
          onClick={() => {
            setCanceling(true);
            onCancel().catch(() => setCanceling(false));
          }}
        >
          {canceling ? 'Canceling…' : 'Cancel'}
        </button>
      )}
      {open && (
        <ol className="thinking-steps" aria-live={active ? 'polite' : undefined}>
          {run.steps.map((s) => (
            <li key={s.id} className={`thinking-step thinking-step--${s.kind}`}>
              <span className="thinking-icon" aria-hidden="true">{STEP_ICONS[s.kind]}</span>
              <div>
                <p className="thinking-title">{s.title}</p>
                {s.detail && <p className="thinking-detail">{s.detail}</p>}
              </div>
            </li>
          ))}
          {active && (
            <li className="thinking-step thinking-away">
              You can close this page. Your bot keeps working and everything will be here when you’re back.
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

function FindingsView({ findings }: { findings: Findings }) {
  return (
    <div className="findings">
      <h3>{findings.topic}</h3>
      {findings.approach && <p className="findings-muted">{findings.approach}</p>}
      {findings.takeaways.length > 0 && (
        <>
          <h4>Key takeaways</h4>
          <ul>{findings.takeaways.map((t) => <li key={t}>{t}</li>)}</ul>
        </>
      )}
      {findings.whyTheyWorked && (
        <>
          <h4>Why the top articles worked</h4>
          <p>{findings.whyTheyWorked}</p>
        </>
      )}
      {findings.bookInsights.length > 0 && (
        <>
          <h4>From the books</h4>
          <ul>{findings.bookInsights.map((t) => <li key={t}>{t}</li>)}</ul>
        </>
      )}
      {findings.sources.length > 0 && (
        <details className="findings-sources">
          <summary>{findings.sources.length} sources</summary>
          <ul>
            {findings.sources.map((s) => (
              <li key={`${s.kind}:${s.title}`}>
                {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> : s.title}
                <span className="findings-muted"> · {s.source}{s.points !== null ? ` · ${s.points} points` : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Approval({ onApprove, onReresearch }: {
  onApprove: (notes: string) => Promise<void>;
  onReresearch: (notes: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reresearch' | null>(null);
  const [error, setError] = useState('');

  async function act(which: 'approve' | 'reresearch', e?: FormEvent) {
    e?.preventDefault();
    setBusy(which);
    setError('');
    try {
      await (which === 'approve' ? onApprove(notes.trim()) : onReresearch(notes.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(null);
    }
  }

  return (
    <form className="approval" onSubmit={(e) => act('approve', e)}>
      <p className="approval-q">Happy with this research?</p>
      <textarea
        className="character-input"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Your thoughts (optional): what to focus on, change or avoid"
        aria-label="Your thoughts on the research (optional)"
      />
      {error && <p className="chat-error" role="alert">{error}</p>}
      <div className="character-actions">
        <button type="button" className="niche-back" disabled={busy !== null} onClick={() => act('reresearch')}>
          {busy === 'reresearch' ? 'Starting…' : 'Re-research'}
        </button>
        <button type="submit" className="niche-create" disabled={busy !== null}>
          {busy === 'approve' ? 'Starting…' : 'Approve & make video'}
        </button>
      </div>
    </form>
  );
}

function ProductionView({ production }: { production: Production }) {
  return (
    <div className="findings">
      <h3>{production.title}</h3>
      {production.summary && <p className="findings-muted">{production.summary}</p>}
      {production.ideas && production.ideas.length > 0 && (
        <>
          <h4>Ideas</h4>
          <ol>{production.ideas.map((i) => <li key={i.title}><strong>{i.title}</strong>{i.hook && ` — “${i.hook}”`}</li>)}</ol>
        </>
      )}
      {production.script && (
        <details className="findings-sources" open>
          <summary>Script</summary>
          <p className="script-text">{production.script}</p>
        </details>
      )}
    </div>
  );
}

export default function RunCard({ run, latest, onApprove, onReresearch, onCancel }: {
  run: Run;
  latest: boolean; // only the newest research can be approved
  onApprove: (notes: string) => Promise<void>;
  onReresearch: (notes: string) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const images = run.media.filter((m) => m.kind === 'image');
  const audio = run.media.filter((m) => m.kind === 'audio');
  const videos = run.media.filter((m) => m.kind === 'video');

  return (
    <li className="run-card">
      <Thinking run={run} onCancel={onCancel} />

      {run.archived && (
        <p className="run-archived">
          Research, script and storyboard were cleared after a week unused.
          {run.result && 'title' in run.result && ` (“${run.result.title}”)`}
        </p>
      )}

      {run.result && run.kind === 'research' && 'takeaways' in run.result && <FindingsView findings={run.result} />}
      {run.result && run.kind === 'production' && 'script' in run.result && <ProductionView production={run.result} />}

      {videos.map((v) => (
        <figure key={v.id} className="run-video-fig">
          <video className="run-video" src={v.url} controls playsInline preload="metadata" />
          <figcaption>
            {v.label} · <a href={v.url} download>Download</a>
          </figcaption>
        </figure>
      ))}
      {images.length > 0 && (
        <ul className="run-frames" aria-label="Storyboard frames">
          {images.map((m) => (
            <li key={m.id}>
              <img src={m.url} alt={m.label} />
              <span>{m.label}</span>
            </li>
          ))}
        </ul>
      )}
      {audio.length > 0 && (
        <details className="findings-sources">
          <summary>{audio.length} voice clip{audio.length === 1 ? '' : 's'}</summary>
          {audio.map((a) => (
            <div key={a.id} className="run-audio">
              <span>{a.label}</span>
              <audio src={a.url} controls preload="none" />
            </div>
          ))}
        </details>
      )}

      {run.status === 'failed' && run.error && <p className="chat-error" role="alert">{run.error}</p>}
      {run.chargedCents > 0 && (
        <p className="run-charged">
          {ACTIVE.has(run.status) ? 'Charged so far' : 'Charged'}: ${(run.chargedCents / 100).toFixed(2)}
        </p>
      )}
      {run.status === 'awaiting_approval' && latest && !run.archived && (
        <Approval onApprove={onApprove} onReresearch={onReresearch} />
      )}
    </li>
  );
}
