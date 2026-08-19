import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  searchable?: boolean;
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
  searchable,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; left: number; width: number }>({ left: 0, width: 200 });

  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.id === selectedId) || options[0];
  const isSearchEnabled = searchable !== undefined ? searchable : options.length > 8;

  const filteredOptions = isSearchEnabled && searchQuery.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(searchQuery.toLowerCase())) ||
        o.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : options;

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = () => {
    if (!dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuWidth = Math.max(rect.width, 220);
    const openUpwards = spaceBelow < 260 && rect.top > 260;

    setMenuPos({
      top: openUpwards ? undefined : rect.bottom + 6,
      bottom: openUpwards ? window.innerHeight - rect.top + 6 : undefined,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)),
      width: menuWidth,
    });
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
    }
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && isSearchEnabled && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 60);
    }
  }, [isOpen, isSearchEnabled]);

  return (
    <div className={clsx('relative block w-full text-left max-w-full', className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => {
          updatePosition();
          setIsOpen(!isOpen);
          setSearchQuery('');
        }}
        className={clsx(
          'inline-flex items-center justify-between w-full bg-[var(--bg-main)] hover:bg-[var(--bg-card)] border border-[var(--color-border)] text-slate-200 font-semibold rounded-md transition-all focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50',
          size === 'sm' ? 'h-7 px-2 text-xs font-mono' : 'h-8 px-2.5 sm:px-3 text-xs font-mono'
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

      {isOpen && mounted && createPortal(
        <div
          ref={menuRef}
          style={{
            top: menuPos.top !== undefined ? `${menuPos.top}px` : undefined,
            bottom: menuPos.bottom !== undefined ? `${menuPos.bottom}px` : undefined,
            left: `${menuPos.left}px`,
            width: `${menuPos.width}px`,
          }}
          className="fixed bg-[var(--bg-surface)] border border-[var(--color-border)] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.95)] z-[99999999] p-1.5 animate-in fade-in zoom-in-95 duration-100"
        >
          {title && (
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-[#232733] mb-1 font-mono">
              {title}
            </div>
          )}

          {isSearchEnabled && (
            <div className="p-1 mb-1.5">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search options..."
                className="w-full h-7 bg-[var(--bg-main)] border border-[#232733] px-2 rounded text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50 font-mono"
              />
            </div>
          )}

          <div className="max-h-52 overflow-y-auto space-y-0.5 pr-0.5">
            {filteredOptions.length === 0 ? (
              <div className="py-3 text-center text-xs text-slate-500 font-mono">No matching options</div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = option.id === selectedId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onSelect(option);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className={clsx(
                      'w-full text-left px-2.5 py-1.5 text-xs flex items-center justify-between transition-all rounded-md font-mono',
                      isSelected
                        ? 'bg-[var(--accent-dim)] text-[var(--color-accent)] font-semibold border border-[var(--accent-border)]'
                        : 'text-slate-200 hover:bg-[var(--bg-card)]'
                    )}
                  >
                    <div className="truncate min-w-0">
                      <div className="truncate font-medium">{option.label}</div>
                      {option.sublabel && (
                        <div className="text-[10px] text-slate-400 font-mono truncate">{option.sublabel}</div>
                      )}
                    </div>
                    {isSelected && <WardenIcon name="check" size={13} className="text-[var(--color-accent)] ml-2 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
