'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { WardenIcon } from '../../components/ui/WardenIcon';

export default function ConsolePage() {
  const [serverId, setServerId] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [command, setCommand] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const activeId = localStorage.getItem('warden_selected_server_id') || '';
    setServerId(activeId);

    const handleServerChange = (e: any) => {
      if (e.detail) {
        setServerId(e.detail);
        setLogs([]);
      }
    };

    window.addEventListener('warden_server_changed', handleServerChange);
    return () => window.removeEventListener('warden_server_changed', handleServerChange);
  }, []);

  const fetchConsoleLogs = () => {
    if (!serverId) return;
    fetch(`/api/v1/servers/${serverId}/console`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setLogs(data.data);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchConsoleLogs();
    const interval = setInterval(fetchConsoleLogs, 3000);
    return () => clearInterval(interval);
  }, [serverId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleSendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || !serverId) return;

    const cmdToSend = command.trim();
    setCommand('');
    setSending(true);

    fetch(`/api/v1/servers/${serverId}/console`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmdToSend }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setLogs((prev) => [...prev, `[COMMAND Executed]: ${cmdToSend}`]);
        }
      })
      .finally(() => setSending(false));
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Bar */}
      <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2.5 sm:gap-3 font-minecraft">
            <WardenIcon name="terminal-square" size={20} className="text-[var(--color-accent)] shrink-0" />
            <span>Minecraft Console</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time console stdout stream and command execution via Crafty Controller.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchConsoleLogs} isLoading={loading} className="shrink-0 self-start sm:self-auto">
          <WardenIcon name="refresh-cw" size={14} className="text-slate-300" />
          <span>Refresh</span>
        </Button>
      </Card>

      {/* Terminal Card */}
      <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-3 sm:p-4 flex flex-col space-y-3">
        {/* Terminal Screen */}
        <div className="bg-[var(--bg-main)] border border-[var(--color-border)] rounded-xl p-3 sm:p-4 font-mono text-[11px] sm:text-xs text-slate-300 h-[380px] sm:h-[480px] overflow-y-auto space-y-1 select-text leading-relaxed">
          {logs.length === 0 ? (
            <div className="text-slate-500 py-12 text-center">
              Waiting for live server console output...
            </div>
          ) : (
            logs.map((line, i) => (
              <div key={i} className="break-all flex items-start gap-1.5">
                <span className="text-[var(--color-accent)] shrink-0 font-bold">&gt;</span>
                <span className={line.includes('WARN') ? 'text-amber-400' : line.includes('ERROR') ? 'text-rose-400' : 'text-slate-300'}>
                  {line}
                </span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>

        {/* Command Form */}
        <form onSubmit={handleSendCommand} className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-2.5 text-[var(--color-accent)] font-mono font-bold text-xs">&gt;</span>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Type command (e.g. list, op Steve, say Hello)..."
              className="w-full bg-[var(--bg-main)] text-slate-100 font-mono text-xs pl-7 pr-3 py-2 rounded-lg border border-[var(--color-border)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={sending}
            disabled={!command.trim()}
            className="shrink-0"
          >
            <WardenIcon name="play" size={14} className="text-[#0d0e11]" />
            <span className="hidden sm:inline">Send</span>
          </Button>
        </form>
      </Card>
    </div>
  );
}
