'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { JobLog, JobStep } from '@warden/shared';
import { WardenIcon } from '../../components/ui/WardenIcon';

export default function JobsPage() {
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const fetchLogs = () => {
    setLoading(true);
    fetch('/api/v1/jobs')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          setLogs(res.data);
          if (res.data.length > 0) setExpandedJobId(res.data[0].id);
        }
      })
      .catch((err) => console.error('Error fetching job logs:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedJobId(expandedJobId === id ? null : id);
  };

  const getLevelBadgeClass = (level: JobStep['level']) => {
    switch (level) {
      case 'success':
        return 'text-[var(--color-accent)] border-[var(--accent-border)] bg-[var(--accent-dim)]';
      case 'error':
        return 'text-red-400 border-red-800/40 bg-red-950/40';
      case 'warn':
        return 'text-amber-400 border-amber-800/40 bg-amber-950/40';
      default:
        return 'text-slate-400 border-[var(--color-border)] bg-[var(--bg-main)]';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2.5 sm:gap-3">
            <WardenIcon name="clock" size={20} className="text-[var(--color-accent)] shrink-0" />
            <span>Audit Logs &amp; History</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Persisted execution trail for 4 AM daily safety engine and manual mod updates
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} className="shrink-0 self-start sm:self-auto">
          Refresh Logs
        </Button>
      </Card>

      {/* Logs List */}
      {loading ? (
        <div className="py-20 text-center font-mono text-slate-500">LOADING AUDIT LOGS...</div>
      ) : logs.length === 0 ? (
        <Card className="py-12 text-center text-slate-500 font-mono text-xs">
          No job execution history recorded yet. The 4 AM safety engine will log all update steps here.
        </Card>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {logs.map((log) => {
            const isExpanded = expandedJobId === log.id;
            return (
              <Card key={log.id} className="p-0 overflow-hidden">
                {/* Job Summary Row */}
                <div
                  onClick={() => toggleExpand(log.id)}
                  className="px-4 sm:px-5 py-3.5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 cursor-pointer hover:bg-[var(--bg-card)] transition-colors select-none"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <Badge status={log.status as any} />
                    <div>
                      <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        <span>{log.serverName}</span>
                        <span className="text-xs text-slate-400 font-normal font-mono">({log.trigger.toUpperCase()})</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{log.summary}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-[var(--color-border)]/50">
                    <div className="text-left sm:text-right text-[11px] sm:text-xs text-slate-400 font-mono">
                      <div>{new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString()}</div>
                    </div>
                    <WardenIcon name="chevron-down" size={16} className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {/* Rollback Warning Alert */}
                {log.status === 'rolled_back' && (
                  <div className="bg-purple-950/40 border-y border-purple-800/40 px-4 sm:px-5 py-3 text-xs text-purple-300 flex items-center gap-2 font-mono">
                    <WardenIcon name="triangle-alert" size={16} className="text-purple-400 shrink-0" />
                    <span>AUTOMATIC ROLLBACK EXECUTED: Mod update caused startup failure. Server restored to safe backup state.</span>
                  </div>
                )}

                {/* Step Details Expandable Drawer */}
                {isExpanded && (
                  <div className="border-t border-[var(--color-border)] bg-[var(--bg-main)] p-4 sm:p-5 space-y-2 text-xs">
                    <div className="font-bold text-slate-400 uppercase tracking-wider mb-3 text-[11px]">
                      Execution Step Timeline ({log.steps.length} Steps)
                    </div>
                    {log.steps.map((step, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3 py-2 border-b border-[var(--color-border)]">
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-slate-500 font-mono text-[11px]">
                            {new Date(step.timestamp).toLocaleTimeString()}
                          </span>
                          <span
                            className={`px-2 py-0.5 border text-[10px] uppercase font-bold rounded shrink-0 ${getLevelBadgeClass(
                              step.level
                            )}`}
                          >
                            {step.step}
                          </span>
                        </div>
                        <span className="text-slate-300 flex-1 font-mono text-[11px] sm:text-xs break-words">{step.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

