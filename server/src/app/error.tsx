'use client';

import React, { useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { WardenIcon } from '../components/ui/WardenIcon';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Warden] Segment runtime error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-6 sm:p-8 max-w-md w-full text-center space-y-4 shadow-xl">
        <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto">
          <WardenIcon name="triangle-alert" size={24} className="text-red-400" />
        </div>

        <div className="space-y-1">
          <h2 className="font-minecraft text-base sm:text-lg font-bold text-slate-100 uppercase">
            Something went wrong
          </h2>
          <p className="text-xs text-slate-400 font-mono break-all leading-relaxed">
            {error.message || 'An unexpected client runtime error occurred.'}
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={() => (window.location.href = '/')}>
            Home
          </Button>
          <Button variant="primary" size="sm" onClick={() => reset()}>
            Try Again
          </Button>
        </div>
      </Card>
    </div>
  );
}
