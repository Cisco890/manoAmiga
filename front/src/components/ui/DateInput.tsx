import type { InputHTMLAttributes } from 'react';
import { parseDate } from '../../lib/dates.ts';

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
};

export function DateInput({ value, onChange, ...props }: DateInputProps) {
  return (
    <input
      {...props}
      type="text"
      placeholder="dd/mm/aaaa"
      maxLength={10}
      value={value}
      ref={(input) => {
        input?.setCustomValidity(
          value && !parseDate(value) ? 'Ingrese una fecha válida en formato día/mes/año (dd/mm/aaaa).' : '',
        );
      }}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
