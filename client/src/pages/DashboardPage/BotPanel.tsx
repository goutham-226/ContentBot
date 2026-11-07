import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useBots } from './bots';
import type { Bot, BotImage, BotMessage, Run } from './bots';
import { approveResearch, cancelRun, getThread, regenerateIdentity, reresearch, sendIdea } from '../../api';
import type { IdentityAsset } from '../../api';
import RunCard from './RunCard';
import BotAvatar from './BotAvatar';
import { SendIcon, TrashIcon } from '../../components/icons';

const MESSAGE_MAX = 4000;

const ASSET_TAGS: Record<NonNullable<BotImage['asset']>, string> = {
  character: 'AI character',
  character_sheet: 'Character sheet',
  channel_avatar: 'Profile picture',
  channel_banner: 'Banner',
};
const CHARACTER_MAX = 2000;

export default function BotPanel() {
  const { botId } = useParams();
  const { bots, loading } = useBots();
  const bot = bots.find((b) => b.id === botId);

  if (loading) return null;

  if (!bot) {
    return (
      <div className="bot-missing">
        <h1>Bot not found</h1>
        <p>This bot doesn’t exist or is no longer available.</p>
        <Link to="/app" className="primary-link">Create a new bot</Link>
      </div>
    );
  }

  // Keyed so switching bots starts with a fresh thread, draft and delete prompt.
  return <BotView key={bot.id} bot={bot} />;
}

function BotView({ bot }: { bot: Bot }) {
  const { removeBot } = useBots();
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [threadVersion, setThreadVersion] = useState(0); // bumped to make the chat reload

  const credits = bot.images.filter((img) => img.source);
  const isChannelAsset = (img: BotImage) => img.asset === 'channel_avatar' || img.asset === 'channel_banner';
  const characterImages = bot.images.filter((img) => !isChannelAsset(img));
  const avatar = bot.images.find((img) => img.asset === 'channel_avatar');
  const banner = bot.images.find((img) => img.asset === 'channel_banner');

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');
    try {
      await removeBot(bot.id);
      navigate('/app', { replace: true });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Couldn’t delete this bot.');
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="bot-view">
      <header className="bot-head">
        <BotAvatar color={bot.color} size="lg" />
        <div className="bot-head-text">
          <h1>{bot.name}</h1>
          <ul className="bot-niches" aria-label="Niches">
            {bot.niches.map((niche) => (
              <li key={niche} className="bot-niche">{niche}</li>
            ))}
          </ul>
        </div>
        {!confirmingDelete && (
          <button
            type="button"
            className="dock-icon-btn bot-delete"
            onClick={() => setConfirmingDelete(true)}
            aria-label="Delete bot"
            title="Delete bot"
          >
            <TrashIcon />
          </button>
        )}
      </header>

      {confirmingDelete && (
        <div className="bot-confirm" role="alertdialog" aria-labelledby="delete-title">
          <p id="delete-title">
            Delete <strong>{bot.name}</strong>? Its images, character and messages will be gone for good.
          </p>
          <div className="bot-confirm-actions">
            <button type="button" className="niche-back" onClick={() => setConfirmingDelete(false)} autoFocus>
              Cancel
            </button>
            <button type="button" className="danger-btn" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      )}
      {deleteError && <p className="chat-error" role="alert">{deleteError}</p>}

      <section className="bot-identity" aria-labelledby="identity-heading">
        <h2 id="identity-heading">
          Channel identity
          {bot.identity.custom && <span className="bot-identity-tag">Custom</span>}
        </h2>
        <p className="bot-identity-name">{bot.identity.name}</p>
        {bot.identity.description && <p className="bot-identity-desc">{bot.identity.description}</p>}
        {characterImages.length > 0 && (
          <ul className="thumbs thumbs--small" aria-label="Character images">
            {characterImages.map((img) => (
              <li key={img.id} className="thumb">
                <a href={img.url} target="_blank" rel="noopener noreferrer">
                  <img src={img.url} alt={img.name} />
                </a>
                {img.asset && <span className="thumb-tag">{ASSET_TAGS[img.asset]}</span>}
              </li>
            ))}
          </ul>
        )}
        {credits.length > 0 && (
          <p className="bot-credits">
            Reference images found on Openverse:{' '}
            {credits.map((img, i) => (
              <span key={img.id}>
                {i > 0 && ', '}
                <a href={img.source?.url} target="_blank" rel="noopener noreferrer">{img.source?.creator}</a>
                {' '}({img.source?.license})
              </span>
            ))}
          </p>
        )}
      </section>

      {(avatar || banner) && (
        <section className="channel-kit" aria-labelledby="channel-kit-heading">
          <h2 id="channel-kit-heading">Channel images</h2>
          <div className="channel-kit-row">
            {avatar && (
              <figure>
                <img className="channel-avatar" src={avatar.url} alt={`${bot.name} profile picture`} />
                <a href={avatar.url} download={`${bot.name} profile picture`}>Download</a>
              </figure>
            )}
            {banner && (
              <figure className="channel-banner-fig">
                <img className="channel-banner" src={banner.url} alt={`${bot.name} channel banner`} />
                <a href={banner.url} download={`${bot.name} banner`}>Download</a>
              </figure>
            )}
          </div>
        </section>
      )}

      {bot.character.approved && bot.images.some((img) => img.aiGenerated) && (
        <Regenerate bot={bot} onStarted={() => setThreadVersion((v) => v + 1)} />
      )}

      <CharacterCard bot={bot} />

      {bot.character.approved && <Chat bot={bot} version={threadVersion} />}
    </div>
  );
}

// Draft characters (up to two) to approve or edit. Chat opens once they're approved.
function CharacterCard({ bot }: { bot: Bot }) {
  const { approveCharacter } = useBots();
  const [editing, setEditing] = useState(!bot.character.approved);
  const [text, setText] = useState(bot.character.text);
  const [second, setSecond] = useState(bot.character.second);
  const [hasSecond, setHasSecond] = useState(bot.character.second.trim() !== '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const secondText = hasSecond ? second.trim() : '';
  const changed = text.trim() !== bot.character.text.trim() || secondText !== bot.character.second.trim();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      await approveCharacter(bot.id, text, secondText);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save your characters.');
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setText(bot.character.text);
    setSecond(bot.character.second);
    setHasSecond(bot.character.second.trim() !== '');
    setEditing(false);
  }

  if (!editing) {
    return (
      <section className="character-card" aria-labelledby="character-heading">
        <h2 id="character-heading">
          {bot.character.second ? 'Characters' : 'Character'}
          <button type="button" className="character-edit" onClick={() => setEditing(true)}>Edit</button>
        </h2>
        <p className="character-text">{bot.character.text}</p>
        {bot.character.second && <p className="character-text character-text--second">{bot.character.second}</p>}
      </section>
    );
  }

  return (
    <form className="character-card character-card--editing" onSubmit={handleSubmit}>
      <h2 id="character-heading">
        {bot.character.approved ? 'Edit your characters' : hasSecond ? 'Meet your characters' : 'Meet your character'}
      </h2>
      {!bot.character.approved && (
        <p className="character-hint">
          Here’s a first draft. Approve it, or edit anything you’d like first. You can have up to two characters.
        </p>
      )}
      <textarea
        className="character-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={CHARACTER_MAX}
        rows={6}
        aria-label="Character 1"
      />
      {hasSecond ? (
        <>
          <div className="character-second-head">
            <span>Character 2</span>
            <button type="button" className="character-edit" onClick={() => setHasSecond(false)}>Remove</button>
          </div>
          <textarea
            className="character-input"
            value={second}
            onChange={(e) => setSecond(e.target.value)}
            maxLength={CHARACTER_MAX}
            rows={6}
            placeholder={'Name: …\nLook: …\nPersonality: …\nVoice: …'}
            aria-label="Character 2"
          />
        </>
      ) : (
        <button type="button" className="character-add" onClick={() => setHasSecond(true)}>+ Add a second character</button>
      )}
      {error && <p className="chat-error" role="alert">{error}</p>}
      <div className="character-actions">
        {bot.character.approved && (
          <button type="button" className="niche-back" onClick={cancel}>Cancel</button>
        )}
        <button type="submit" className="niche-create" disabled={!text.trim() || saving}>
          {saving ? 'Saving…' : changed ? 'Save & approve' : bot.character.approved ? 'Save' : 'Approve'}
        </button>
      </div>
    </form>
  );
}

const REGEN_OPTIONS: { asset: IdentityAsset; label: string }[] = [
  { asset: 'character', label: 'Character' },
  { asset: 'character_sheet', label: 'Character sheet' },
  { asset: 'channel_avatar', label: 'Profile picture' },
  { asset: 'channel_banner', label: 'Banner' },
];

// "Not quite right?": pick what to redraw, say what to change, regenerate.
function Regenerate({ bot, onStarted }: { bot: Bot; onStarted: () => void }) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<IdentityAsset[]>([]);
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  function toggle(asset: IdentityAsset) {
    setTargets((prev) => (prev.includes(asset) ? prev.filter((a) => a !== asset) : [...prev, asset]));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (targets.length === 0 || sending) return;
    setSending(true);
    setError('');
    try {
      await regenerateIdentity(bot.id, targets, notes.trim());
      setOpen(false);
      setTargets([]);
      setNotes('');
      onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t start regenerating.');
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="regen-open" onClick={() => setOpen(true)}>
        Not quite right? Regenerate images
      </button>
    );
  }

  return (
    <form className="character-card character-card--editing regen" onSubmit={handleSubmit}>
      <h2>Regenerate images</h2>
      <fieldset className="regen-targets">
        <legend className="character-hint">What should be redrawn?</legend>
        {REGEN_OPTIONS.map((o) => (
          <label key={o.asset} className="regen-option">
            <input type="checkbox" checked={targets.includes(o.asset)} onChange={() => toggle(o.asset)} />
            {o.label}
          </label>
        ))}
      </fieldset>
      <textarea
        className="character-input"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="What should change? e.g. make the hat blue, friendlier smile, darker banner"
        aria-label="What should change"
      />
      {error && <p className="chat-error" role="alert">{error}</p>}
      <div className="character-actions">
        <button type="button" className="niche-back" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="niche-create" disabled={targets.length === 0 || sending}>
          {sending ? 'Starting…' : 'Regenerate'}
        </button>
      </div>
    </form>
  );
}

const POLL_MS = 3000;

// The thread: the user's ideas and the bot's runs, kept fresh while anything is working.
function Chat({ bot, version }: { bot: Bot; version: number }) {
  const { refreshBots, refreshBalance } = useBots();
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const working = runs.some((r) => r.status === 'queued' || r.status === 'running');
  const busy = runs.some((r) => r.kind !== 'character' && (r.status === 'queued' || r.status === 'running'));
  const latestResearchId = [...runs].reverse().find((r) => r.kind === 'research')?.id;
  const drawingCharacter = runs.some((r) => r.kind === 'character' && (r.status === 'queued' || r.status === 'running'));

  const load = useCallback(async () => {
    const thread = await getThread(bot.id);
    setMessages(thread.messages);
    setRuns(thread.runs);
    setLoaded(true);
  }, [bot.id]);

  useEffect(() => {
    let cancelled = false;
    getThread(bot.id)
      .then((thread) => {
        if (cancelled) return;
        setMessages(thread.messages);
        setRuns(thread.runs);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Couldn’t load the chat.');
      });
    return () => {
      cancelled = true;
    };
  }, [bot.id, version]);

  // Poll only while something is working.
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => {
      // Charges land as parts finish, so keep the balance current too.
      Promise.all([load(), refreshBalance()]).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [working, load, refreshBalance]);

  // The AI character lives on the bot, so refresh it once it's drawn.
  const [wasDrawing, setWasDrawing] = useState(false);
  if (wasDrawing !== drawingCharacter) {
    setWasDrawing(drawingCharacter);
    if (!drawingCharacter && wasDrawing) void refreshBots();
  }

  useEffect(() => {
    if (loaded) endRef.current?.scrollIntoView({ block: 'end' });
  }, [loaded, messages.length, runs.length]);

  // Grow the text bar with its content, up to the CSS max-height.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  async function start(action: () => Promise<{ message: BotMessage; run: Run | null }>) {
    const { message, run } = await action();
    setMessages((prev) => [...prev, message]);
    if (run) setRuns((prev) => [...prev, run]);
    await load();
  }

  async function handleSend(surprise = false) {
    const body = draft.trim();
    if ((!surprise && !body) || sending || busy) return;
    setSending(true);
    setError('');
    try {
      await start(() => sendIdea(bot.id, surprise ? { surprise: true } : { body }));
      if (!surprise) setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t send your idea.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void handleSend();
  }

  // Enter sends, Shift+Enter adds a new line (unless an IME is composing).
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  }

  // Messages and runs in time order; each run sits right after the message that started it.
  const runsByMessage = new Map(runs.filter((r) => r.messageId).map((r) => [r.messageId, r]));
  const items = [
    ...messages.map((m) => ({ at: m.createdAt, key: `m:${m.id}`, message: m, run: runsByMessage.get(m.id) })),
    ...runs.filter((r) => !r.messageId).map((r) => ({ at: r.createdAt, key: `r:${r.id}`, message: null, run: r })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <>
      <ol className="chat-thread" aria-label={`Conversation with ${bot.name}`}>
        {loaded && items.length === 0 && (
          <li className="chat-empty">
            Give {bot.name} a video idea, or tap <strong>Surprise me</strong>. It will research top articles and
            books, check in with you, then write the script and make the video.
          </li>
        )}
        {items.map((item) => (
          <Fragment key={item.key}>
            {item.message && <li className={`chat-msg chat-msg--${item.message.role}`}>{item.message.body}</li>}
            {item.run && (
              <RunCard
                run={item.run}
                latest={item.run.id === latestResearchId}
                onApprove={(notes) => start(() => approveResearch(bot.id, item.run!.id, notes))}
                onReresearch={(notes) => start(() => reresearch(bot.id, item.run!.id, notes))}
                onCancel={async () => {
                  await cancelRun(bot.id, item.run!.id);
                  await Promise.all([load(), refreshBalance()]);
                }}
              />
            )}
          </Fragment>
        ))}
      </ol>
      <div ref={endRef} />

      <form className="chat-bar" onSubmit={handleSubmit}>
        {error && <p className="chat-error" role="alert">{error}</p>}
        <div className="chat-input">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={MESSAGE_MAX}
            rows={1}
            disabled={busy}
            placeholder={busy ? `${bot.name} is working on it…` : `Give ${bot.name} a video idea`}
            aria-label={`Video idea for ${bot.name}`}
          />
          <button
            type="button"
            className="chat-surprise"
            onClick={() => handleSend(true)}
            disabled={busy || sending}
          >
            Surprise me
          </button>
          <button type="submit" className="chat-send" disabled={!draft.trim() || sending || busy} aria-label="Send">
            <SendIcon />
          </button>
        </div>
      </form>
    </>
  );
}
