import React, { useState } from 'react';
import { clsx } from 'clsx';

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  className?: string;
  containerClassName?: string;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  className,
  containerClassName,
  disabled,
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={clsx('relative flex items-center w-full', containerClassName)}>
      <input
        {...props}
        type={showPassword ? 'text' : 'password'}
        disabled={disabled}
        className={clsx(
          'w-full h-9 sm:h-10 bg-[var(--bg-main)] hover:bg-[var(--bg-card)] border border-[var(--color-border)] pl-3 pr-10 rounded-md text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/60 focus:border-[var(--color-accent)] font-mono transition-all',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      />

      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={() => setShowPassword(!showPassword)}
        title={showPassword ? 'Hide password' : 'Show password'}
        className={clsx(
          'absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-[var(--bg-surface)] active:scale-95 transition-all focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50 cursor-pointer select-none group',
          disabled && 'pointer-events-none opacity-50'
        )}
      >
        {/* Smooth Animated SVG Eye Icon */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 text-slate-400 group-hover:text-[var(--color-accent)] transition-colors duration-200"
        >
          {/* Eye Outline */}
          <path
            d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"
            className="transition-all duration-300 ease-out"
          />

          {/* Eye Pupil / Center Circle */}
          <circle
            cx="12"
            cy="12"
            r="3"
            className={clsx(
              'transition-all duration-300 ease-out origin-center',
              showPassword ? 'scale-90 opacity-80' : 'scale-100 opacity-100'
            )}
          />

          {/* Smooth Diagonal Slash Line across Eye */}
          <line
            x1="3"
            y1="3"
            x2="21"
            y2="21"
            strokeDasharray="26"
            strokeDashoffset={showPassword ? '0' : '26'}
            className="transition-all duration-300 ease-out stroke-[2.2]"
            style={{
              transition: 'stroke-dashoffset 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
              opacity: showPassword ? 1 : 0,
            }}
          />
        </svg>
      </button>
    </div>
  );
};
