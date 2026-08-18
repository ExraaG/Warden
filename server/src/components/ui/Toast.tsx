'use client';

import React, { useState, useEffect } from 'react';
import { WardenIcon } from './WardenIcon';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('warden_toast', { detail: { message, type } }));
  }
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string; type: 'success' | 'error' | 'info' }>;
      if (!customEvent.detail) return;
      const { message, type } = customEvent.detail;
      const id = Math.random().toString(36).substring(2, 9);
      
      setToasts((prev) => [...prev, { id, message, type: type || 'info' }]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    };

    window.addEventListener('warden_toast', handleToast);
    return () => window.removeEventListener('warden_toast', handleToast);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-3 sm:px-0">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-lg border shadow-xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${
            toast.type === 'success'
              ? 'bg-[#13161c]/95 border-[var(--color-accent)] text-slate-100 shadow-[var(--color-accent)]/10'
              : toast.type === 'error'
              ? 'bg-[#1a1315]/95 border-red-500/50 text-red-100 shadow-red-500/10'
              : 'bg-[#13161c]/95 border-slate-700 text-slate-100'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                toast.type === 'success'
                  ? 'bg-[var(--color-accent)]/20 text-[var(--color-accent)]'
                  : toast.type === 'error'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-slate-700/50 text-slate-300'
              }`}
            >
              <WardenIcon
                name={toast.type === 'success' ? 'check' : toast.type === 'error' ? 'triangle-alert' : 'box'}
                size={14}
              />
            </div>
            <span className="text-xs font-mono break-words leading-snug">{toast.message}</span>
          </div>

          <button
            onClick={() => removeToast(toast.id)}
            className="text-slate-400 hover:text-slate-200 transition-colors shrink-0 p-0.5"
            title="Dismiss"
          >
            <WardenIcon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};
