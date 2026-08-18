'use client';

import React, { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Warden] Global root error:', error);
  }, [error]);

  return (
    <html lang="en" data-theme="emerald">
      <body className="bg-[#0d0e11] text-slate-100 min-h-screen flex items-center justify-center p-4 font-sans">
        <div className="bg-[#13161c] border border-[#232733] p-6 sm:p-8 rounded-xl max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto font-bold text-xl font-mono">
            !
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100 font-minecraft">Application Error</h2>
            <p className="text-xs text-slate-400 mt-1 font-mono break-all leading-relaxed">
              {error.message || 'A fatal client rendering error occurred.'}
            </p>
          </div>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-[#1bd96a] text-[#0d0e11] font-bold rounded-lg text-xs hover:bg-[#15b758] transition-colors"
          >
            Reload Application
          </button>
        </div>
      </body>
    </html>
  );
}
