import type { ChangeEvent, FocusEvent, ReactNode } from 'react';

type FloatingInputProps = {
  id: string;
  label: string;
  type?: 'text' | 'email' | 'password';
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  rightSlot?: ReactNode;
  error?: string;
};

export default function FloatingInput({
  id, label, type = 'text', value, onChange, onBlur, autoComplete, rightSlot, error,
}: FloatingInputProps) {
  const errorId = `${id}-error`;
  const classes = ['field', value && 'field--filled', error && 'field--invalid'].filter(Boolean).join(' ');

  return (
    <div className="field-wrap">
      <div className={classes}>
        <input
          id={id}
          className="field__input"
          type={type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <label htmlFor={id} className="field__label">{label}</label>
        {rightSlot && <div className="field__slot">{rightSlot}</div>}
      </div>
      {error && <p id={errorId} className="field-error">{error}</p>}
    </div>
  );
}
