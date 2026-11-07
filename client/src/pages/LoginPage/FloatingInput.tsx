import type { ChangeEvent, ReactNode } from 'react';

type FloatingInputProps = {
  id: string;
  label: string;
  type?: 'text' | 'email' | 'password';
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  rightSlot?: ReactNode;
};

export default function FloatingInput({
  id, label, type = 'text', value, onChange, autoComplete, rightSlot,
}: FloatingInputProps) {
  return (
    <div className={`field ${value ? 'field--filled' : ''}`}>
      <input
        id={id}
        className="field__input"
        type={type}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
      />
      <label htmlFor={id} className="field__label">{label}</label>
      {rightSlot && <div className="field__slot">{rightSlot}</div>}
    </div>
  );
}
