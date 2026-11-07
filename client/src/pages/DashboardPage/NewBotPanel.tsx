import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { joinNiches, useBots } from './bots';
import type { IdentityInput } from '../../api';
import { NICHES } from './niches';
import { CUSTOM_DESCRIPTION_MAX, CUSTOM_NAME_MAX, IDENTITY_PRESETS } from './identities';
import ImagesStep from './ImagesStep';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGES, MAX_IMAGE_MB } from './images';
import type { DraftImage } from './images';
import { CheckIcon } from '../../components/icons';
import BotAvatar from './BotAvatar';
import { BOT_COLORS, DEFAULT_BOT_COLOR } from './botColors';
import VoicePicker from './VoicePicker';
import { DEFAULT_VOICES, DUO_PRESETS } from './voices';

const MAX_NICHES = 3;
const CUSTOM = 'custom';
const BOT_NAME_MAX = 40;

// Must match the bubble-float animation duration in DashboardPage.css.
// Each bubble starts a little later in the cycle than the one before, so a
// gentle wave rolls across the cloud instead of everything bobbing in sync.
const FLOAT_PERIOD_S = 5;
const FLOAT_STAGGER_S = 0.35;

type Step = 'niche' | 'identity' | 'images' | 'name';

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'niche', label: 'Niche' },
    { key: 'identity', label: 'Channel identity' },
    { key: 'images', label: 'Images' },
    { key: 'name', label: 'Name' },
  ];
  const currentIndex = steps.findIndex((s) => s.key === step);

  return (
    <ol className="stepper" aria-label="Create a bot">
      {steps.map((s, i) => (
        <li
          key={s.key}
          className={i === currentIndex ? 'is-current' : i < currentIndex ? 'is-done' : ''}
          aria-current={i === currentIndex ? 'step' : undefined}
        >
          <span className="stepper-num">{i < currentIndex ? <CheckIcon /> : i + 1}</span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

export default function NewBotPanel() {
  const { addBot } = useBots();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('niche');
  const [selected, setSelected] = useState<string[]>([]);
  const [identityId, setIdentityId] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [images, setImages] = useState<DraftImage[]>([]);
  const [imageError, setImageError] = useState('');
  const [botName, setBotName] = useState('');
  const [botColor, setBotColor] = useState(DEFAULT_BOT_COLOR);
  const [voices, setVoices] = useState<[string, string]>(DEFAULT_VOICES);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const headingRef = useRef<HTMLHeadingElement>(null);
  const customNameRef = useRef<HTMLInputElement>(null);
  const botNameRef = useRef<HTMLInputElement>(null);
  const isFirstRender = useRef(true);
  // For the unmount cleanup below, which can't see later state.
  const imagesRef = useRef(images);

  const atLimit = selected.length >= MAX_NICHES;

  // Derived: null until the user has a complete choice. `input` is what the API receives.
  const preset = IDENTITY_PRESETS.find((p) => p.id === identityId);
  const trimmedName = customName.trim();
  const identity: { name: string; input: IdentityInput } | null =
    identityId === CUSTOM
      ? trimmedName
        ? { name: trimmedName, input: { name: trimmedName, description: customDescription.trim() } }
        : null
      : preset
        ? { name: preset.name, input: { presetId: preset.id } }
        : null;

  // Move focus to the new step's heading so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    // The name step goes straight to its (required) field.
    if (step === 'name') botNameRef.current?.focus();
    else headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (identityId === CUSTOM) customNameRef.current?.focus();
  }, [identityId]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // Free preview memory on leaving; saved bots load their images from the server.
  useEffect(
    () => () => imagesRef.current.forEach((img) => URL.revokeObjectURL(img.url)),
    [],
  );

  const imagesRequired = identityId === CUSTOM;
  const isDuo = identityId !== null && DUO_PRESETS.has(identityId);
  const imagesReady = !imagesRequired || images.length > 0;

  function addImages(files: File[]) {
    const errors: string[] = [];
    const accepted: DraftImage[] = [];
    const room = MAX_IMAGES - images.length;

    for (const file of files) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        errors.push(`${file.name} isn’t a PNG, JPG, WEBP or GIF.`);
      } else if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
        errors.push(`${file.name} is over ${MAX_IMAGE_MB} MB.`);
      } else if (accepted.length >= room) {
        errors.push(`Only ${MAX_IMAGES} images are allowed, so some weren’t added.`);
        break;
      } else {
        accepted.push({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) });
      }
    }

    setImages((prev) => [...prev, ...accepted]);
    setImageError(errors.join(' '));
  }

  function removeImage(id: string) {
    const img = images.find((i) => i.id === id);
    if (img) URL.revokeObjectURL(img.url);
    setImages((prev) => prev.filter((i) => i.id !== id));
    setImageError('');
  }

  function toggle(niche: string) {
    setSelected((prev) => {
      if (prev.includes(niche)) return prev.filter((n) => n !== niche);
      return prev.length < MAX_NICHES ? [...prev, niche] : prev;
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step === 'niche') {
      if (selected.length > 0) setStep('identity');
      return;
    }
    if (step === 'identity') {
      if (identity) setStep('images');
      return;
    }
    if (step === 'images') {
      if (imagesReady) setStep('name');
      return;
    }
    const name = botName.trim();
    if (!identity || !imagesReady || !name || saving) return;

    setSaving(true);
    setSaveError('');
    try {
      const bot = await addBot({
        name,
        color: botColor,
        voices: isDuo ? voices : [voices[0]],
        niches: selected,
        identity: identity.input,
        images: images.map((img) => img.file),
      });
      navigate(`/app/bots/${bot.id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Couldn’t save your bot. Please try again.');
      setSaving(false);
    }
  }

  if (step === 'name' && identity) {
    const trimmed = botName.trim();
    return (
      <div className="new-bot">
        <Stepper step={step} />
        <h1 ref={headingRef} tabIndex={-1}>Name your bot</h1>
        <p className="new-bot-sub">Give it a name, a colour and a voice. The voice stays the same in every video.</p>

        <form className="niche-form" onSubmit={handleSubmit}>
          <div className="name-step">
            <BotAvatar color={botColor} size="lg" />
            <label className="plain-field">
              <span>Bot name</span>
              <input
                ref={botNameRef}
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                maxLength={BOT_NAME_MAX}
                placeholder="e.g. Calm Coach"
                autoComplete="off"
                required
              />
            </label>

            <fieldset className="color-picker">
              <legend>Colour</legend>
              <div className="color-swatches">
                {BOT_COLORS.map((c) => (
                  <label key={c.id} className="color-swatch" style={{ background: c.hex }} title={c.label}>
                    <input
                      type="radio"
                      name="bot-color"
                      value={c.id}
                      checked={botColor === c.id}
                      onChange={() => setBotColor(c.id)}
                      aria-label={c.label}
                    />
                    {botColor === c.id && <CheckIcon />}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <VoicePicker
            legend={isDuo ? 'First character’s voice' : 'Voice'}
            name="voice-1"
            value={voices[0]}
            onChange={(v) => setVoices(([, second]) => [v, second])}
          />
          {isDuo && (
            <VoicePicker
              legend="Second character’s voice"
              name="voice-2"
              value={voices[1]}
              onChange={(v) => setVoices(([first]) => [first, v])}
            />
          )}

          {saveError && <p className="images-error" role="alert">{saveError}</p>}

          <div className="niche-footer">
            <div className="niche-footer-left">
              <button type="button" className="niche-back" onClick={() => setStep('images')}>
                Back
              </button>
              <span className="niche-count">{trimmed ? 'Step 4 of 4' : 'A name is required'}</span>
            </div>
            <button type="submit" className="niche-create" disabled={!trimmed || saving}>
              {saving ? (images.length === 0 && !imagesRequired ? 'Finding images…' : 'Saving…') : 'Create bot'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (step === 'images' && identity) {
    return (
      <div className="new-bot">
        <Stepper step={step} />
        <h1 ref={headingRef} tabIndex={-1}>Add supporting images</h1>
        <p className="new-bot-sub">
          {imagesRequired
            ? `Your own style needs at least one image so your bot knows what “${identity.name}” looks like: characters, settings or example frames.`
            : `Optional. Add images of characters, settings or example frames to steer the ${identity.name} style, or skip and we’ll find openly licensed references online.`}
        </p>

        <form className="niche-form" onSubmit={handleSubmit}>
          <ImagesStep images={images} error={imageError} onAdd={addImages} onRemove={removeImage} />

          <div className="niche-footer">
            <div className="niche-footer-left">
              <button type="button" className="niche-back" onClick={() => setStep('identity')}>
                Back
              </button>
              <span className="niche-count" aria-live="polite">
                {imagesRequired && images.length === 0
                  ? 'At least 1 image required'
                  : `${images.length} of ${MAX_IMAGES} images`}
              </span>
            </div>
            <button type="submit" className="niche-create" disabled={!imagesReady}>
              {images.length === 0 && !imagesRequired ? 'Skip' : 'Next'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (step === 'identity') {
    return (
      <div className="new-bot">
        <Stepper step={step} />
        <h1 ref={headingRef} tabIndex={-1}>Choose your channel identity</h1>
        <p className="new-bot-sub">
          Pick a style for your {joinNiches(selected)} videos, or choose your own.
        </p>

        <form className="niche-form" onSubmit={handleSubmit}>
          <div className="identity-grid" role="group" aria-label="Channel identity">
            {IDENTITY_PRESETS.map((p) => {
              const isSelected = identityId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  className="identity-card"
                  aria-pressed={isSelected}
                  onClick={() => setIdentityId(p.id)}
                >
                  <span className="identity-name">
                    {p.name}
                    {isSelected && <CheckIcon />}
                  </span>
                  <span className="identity-desc">{p.description}</span>
                </button>
              );
            })}
            <button
              type="button"
              className="identity-card identity-card--custom"
              aria-pressed={identityId === CUSTOM}
              onClick={() => setIdentityId(CUSTOM)}
            >
              <span className="identity-name">
                + Choose your own
                {identityId === CUSTOM && <CheckIcon />}
              </span>
              <span className="identity-desc">Describe your own style, characters and voice.</span>
            </button>
          </div>

          {identityId === CUSTOM && (
            <div className="identity-custom">
              <label className="plain-field">
                <span>Style name</span>
                <input
                  ref={customNameRef}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  maxLength={CUSTOM_NAME_MAX}
                  placeholder="e.g. Claymation cats"
                  autoComplete="off"
                />
              </label>
              <label className="plain-field">
                <span>
                  Describe it <span className="optional">(optional)</span>
                </span>
                <textarea
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  maxLength={CUSTOM_DESCRIPTION_MAX}
                  rows={3}
                  placeholder="Look, characters, voice, tone…"
                />
              </label>
            </div>
          )}

          <div className="niche-footer">
            <div className="niche-footer-left">
              <button type="button" className="niche-back" onClick={() => setStep('niche')}>
                Back
              </button>
              <span className="niche-count">Step 2 of 4</span>
            </div>
            <button type="submit" className="niche-create" disabled={!identity}>
              Next
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="new-bot">
      <Stepper step={step} />
      <h1 ref={headingRef} tabIndex={-1}>What should your bot master?</h1>
      <p className="new-bot-sub">
        Pick up to {MAX_NICHES} niches. Your bot will read the top-rated articles in each and turn
        them into style ideas for your channel.
      </p>

      <form className="niche-form" onSubmit={handleSubmit}>
        <div className="bubbles" role="group" aria-label={`Niches, choose up to ${MAX_NICHES}`}>
          {NICHES.map((niche, i) => {
            const isSelected = selected.includes(niche);
            return (
              // The wrapper floats; the button keeps its own press/pop animations.
              <span
                key={niche}
                className="bubble-float"
                style={{ animationDelay: `${-(i * FLOAT_STAGGER_S) % FLOAT_PERIOD_S}s` }}
              >
                <button
                  type="button"
                  className="bubble"
                  aria-pressed={isSelected}
                  disabled={atLimit && !isSelected}
                  onClick={() => toggle(niche)}
                >
                  {isSelected && <CheckIcon />}
                  {niche}
                </button>
              </span>
            );
          })}
        </div>

        <div className="niche-footer">
          <span className="niche-count" aria-live="polite">
            {selected.length} of {MAX_NICHES} selected
          </span>
          <button type="submit" className="niche-create" disabled={selected.length === 0}>
            Next
          </button>
        </div>
      </form>
    </div>
  );
}
