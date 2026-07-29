import { type InputHTMLAttributes } from 'react';
import clsx from 'clsx';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, className, id, ...props }: InputProps) {
  const inputId = id ?? props.name;

  return (
    <div className={clsx('titan-input-group', className)}>
      {label ? (
        <label className="titan-input-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input id={inputId} className={clsx('titan-input', error && 'titan-input--error')} {...props} />
      {error ? <span className="titan-input-error">{error}</span> : null}
    </div>
  );
}
