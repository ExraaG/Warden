import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { WardenIcon } from './WardenIcon';
import { Button } from './Button';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'xl',
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const maxWidths = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
  };

  const modalContent = (
    <div className="fixed inset-0 top-0 left-0 right-0 bottom-0 w-full h-full min-h-screen z-[99999] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md">
      <div
        className={clsx(
          'w-full bg-[var(--bg-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150',
          maxWidths[maxWidth]
        )}
      >
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--bg-card)] shrink-0">
          <h3 className="text-xs sm:text-sm font-bold tracking-tight text-slate-100 flex items-center gap-2 truncate font-minecraft">
            <span className="truncate">{title}</span>
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="p-1 border-none text-slate-400 hover:text-white shrink-0">
            <WardenIcon name="x" size={14} className="text-slate-400" />
          </Button>
        </div>

        <div id="modal-scroll-container" className="p-5 sm:p-6 text-xs sm:text-sm text-slate-200 overflow-y-auto flex-1 min-h-0">
          {children}
        </div>

        {footer && (
          <div className="px-5 sm:px-6 py-3.5 border-t border-[var(--color-border)] bg-[var(--bg-main)] flex flex-wrap items-center justify-end gap-2.5 sm:gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
