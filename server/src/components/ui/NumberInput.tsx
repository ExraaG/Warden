import React from 'react';
import { clsx } from 'clsx';

export interface NumberInputProps {
  value: string | number;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder,
  className,
  disabled,
  id,
}) => {
  const handleIncrement = () => {
    if (disabled) return;
    const current = parseInt(String(value), 10);
    const num = isNaN(current) ? (min ?? 0) : current + step;
    if (max !== undefined && num > max) return;
    onChange(String(num));
  };

  const handleDecrement = () => {
    if (disabled) return;
    const current = parseInt(String(value), 10);
    const num = isNaN(current) ? (min ?? 0) : current - step;
    if (min !== undefined && num < min) return;
    onChange(String(num));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleIncrement();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleDecrement();
    }
  };

  return (
    <div
      className={clsx(
        'relative flex items-center h-8 w-full bg-[var(--bg-main)] hover:bg-[var(--bg-card)] border border-[var(--color-border)] rounded-md transition-all focus-within:ring-1 focus-within:ring-[var(--color-accent)]/50 focus-within:border-[var(--color-accent)]/50',
        disabled && 'opacity-50 pointer-events-none',
        className
      )}
    >
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full h-full bg-transparent px-2.5 sm:px-3 text-xs text-slate-100 font-mono focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <div className="flex flex-col h-full shrink-0 w-6 pr-1 py-0.5">
        <button
          type="button"
          tabIndex={-1}
          onClick={handleIncrement}
          disabled={disabled || (max !== undefined && parseInt(String(value), 10) >= max)}
          className="flex-1 flex items-center justify-center text-slate-400 hover:text-[var(--color-accent)] hover:bg-[var(--accent-dim)]/30 rounded-t transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          title="Increment"
        >
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button
          type="button"
          tabIndex={-1}
          onClick={handleDecrement}
          disabled={disabled || (min !== undefined && parseInt(String(value), 10) <= min)}
          className="flex-1 flex items-center justify-center text-slate-400 hover:text-[var(--color-accent)] hover:bg-[var(--accent-dim)]/30 rounded-b transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          title="Decrement"
        >
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>
  );
};
