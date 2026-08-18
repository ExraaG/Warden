import React, { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { WardenIcon } from './WardenIcon';

export interface DropdownOption {
  id: string;
  label: string;
  sublabel?: string;
  status?: string;
}

export interface DropdownProps {
  options: DropdownOption[];
  selectedId: string;
  onSelect: (option: DropdownOption) => void;
  title?: string;
  className?: string;
  icon?: any;
  placeholder?: string;
  size?: 'sm' | 'md';
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  selectedId,
  onSelect,
  title,
  className,
  icon,
  placeholder = 'Select option',
  size = 'md',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === selectedId) || options[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={clsx('relative block w-full text-left max-w-full', className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'inline-flex items-center justify-between w-full bg-[var(--bg-main)] hover:bg-[var(--bg-card)] border border-[var(--color-border)] text-slate-200 font-semibold rounded-md transition-all focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50',
          size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-2.5 sm:px-3 text-xs'
        )}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 truncate min-w-0">
          {icon ? (
            <WardenIcon name={icon} size={14} className="text-slate-400 shrink-0" />
          ) : null}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </div>
        <WardenIcon name="chevron-down" size={14} className={clsx('text-slate-400 ml-1.5 sm:ml-2 transition-transform shrink-0', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-full min-w-[160px] max-w-[calc(100vw-2rem)] bg-[var(--bg-surface)] border border-[var(--color-border)] rounded-xl shadow-[0_10px_38px_rgba(0,0,0,0.8)] z-[9999] p-1.5">
          {title && (
            <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-[var(--color-border)] mb-1">
              {title}
            </div>
          )}
          <div className="max-h-60 overflow-y-auto space-y-0.5">
            {options.map((option) => {
              const isSelected = option.id === selectedId;
              return (
                <button
                  key={option.id}
                  onClick={() => {
                    onSelect(option);
                    setIsOpen(false);
                  }}
                  className={clsx(
                    'w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-all rounded-lg',
                    isSelected
                      ? 'bg-[var(--accent-dim)] text-[var(--color-accent)] font-semibold border border-[var(--accent-border)]'
                      : 'text-slate-200 hover:bg-[var(--bg-card)]'
                  )}
                >
                  <div className="truncate min-w-0">
                    <div className="truncate font-medium">{option.label}</div>
                    {option.sublabel && (
                      <div className="text-xs text-slate-400 font-mono mt-0.5 truncate">{option.sublabel}</div>
                    )}
                  </div>
                  {isSelected && <WardenIcon name="check" size={14} className="text-[var(--color-accent)] ml-2 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
