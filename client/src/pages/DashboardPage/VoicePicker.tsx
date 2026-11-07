import { useEffect, useRef, useState } from 'react';
import { VOICES } from './voices';

// Pick one of the preset voices, with a sample to listen to. The first listen
// to a voice records its sample, so it can take a few seconds.
export default function VoicePicker({ legend, name, value, onChange }: {
  legend: string;
  name: string; // radio group name, unique on the page
  value: string;
  onChange: (voice: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => () => audioRef.current?.pause(), []);

  function preview(id: string) {
    audioRef.current?.pause();
    if (playing === id || loading === id) {
      setPlaying(null);
      setLoading(null);
      return;
    }
    const audio = new Audio(`/api/voices/${id}/preview`);
    audioRef.current = audio;
    setError('');
    setPlaying(null);
    setLoading(id);
    audio.onplaying = () => {
      setLoading(null);
      setPlaying(id);
    };
    audio.onended = () => setPlaying((p) => (p === id ? null : p));
    audio.onerror = () => {
      setLoading(null);
      setPlaying(null);
      setError('Couldn’t load that sample. Try again in a moment.');
    };
    audio.play().catch(() => {});
  }

  return (
    <fieldset className="voice-picker">
      <legend>{legend}</legend>
      <ul className="voice-options">
        {VOICES.map((v) => (
          <li key={v.id} className={`voice-option ${value === v.id ? 'voice-option--selected' : ''}`}>
            <label>
              <input type="radio" name={name} value={v.id} checked={value === v.id} onChange={() => onChange(v.id)} />
              <span className="voice-name">{v.label}</span>
              <span className="voice-desc">{v.description}</span>
            </label>
            <button
              type="button"
              className="voice-play"
              onClick={() => preview(v.id)}
              aria-label={`${playing === v.id ? 'Stop' : 'Play'} a sample of ${v.label}`}
            >
              {loading === v.id ? '…' : playing === v.id ? '■' : '▶'}
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="chat-error" role="alert">{error}</p>}
    </fieldset>
  );
}
