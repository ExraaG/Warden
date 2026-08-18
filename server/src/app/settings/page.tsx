'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { WardenSettings } from '@warden/shared';
import { WardenIcon } from '../../components/ui/WardenIcon';
import { showToast } from '../../components/ui/Toast';

export default function SettingsPage() {
  const [settings, setSettings] = useState<WardenSettings | null>(null);
  const [wardenApiKey, setWardenApiKey] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('Europe/Vienna');
  const [autoUpdateTime, setAutoUpdateTime] = useState<string>('04:00');
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [checkingUpdate, setCheckingUpdate] = useState<boolean>(false);
  const [updateInfo, setUpdateInfo] = useState<{
    updateAvailable: boolean;
    currentCommit?: string;
    latestCommit?: string;
    commitMessage?: string;
  } | null>(null);

  const fetchUpdateStatus = async (force = false) => {
    try {
      const res = await fetch(`/api/v1/system/update-status${force ? '?force=true' : ''}`).then((r) => r.json());
      if (res.success && res.data) {
        setUpdateInfo(res.data);
        return res.data;
      }
    } catch {}
    return null;
  };

  useEffect(() => {
    fetchUpdateStatus();
    fetch('/api/v1/settings')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setSettings(res.data);
          setTimezone(res.data.timezone || 'Europe/Vienna');
          setAutoUpdateTime(res.data.autoUpdateTime || '04:00');
          setAutoUpdateEnabled(res.data.autoUpdateEnabled !== false);
        }
      })
      .catch((err) => console.error('Error loading settings:', err));
  }, []);

  const handleManualCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const data = await fetchUpdateStatus(true);
      if (data?.updateAvailable) {
        showToast(`Update available! Commit ${data.latestCommit}`, 'info');
      } else {
        showToast('Warden is fully up to date with GitHub!', 'success');
      }
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/v1/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wardenApiKey: wardenApiKey || undefined,
          timezone,
          autoUpdateTime,
          autoUpdateEnabled,
        }),
      }).then((r) => r.json());

      if (res.success) {
        setWardenApiKey('');
        setSettings(res.data);
        showToast('Settings saved successfully!', 'success');
      } else {
        showToast(`Save failed: ${res.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Save error: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-4 sm:p-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2.5 sm:gap-3">
          <WardenIcon name="settings" size={20} className="text-[var(--color-accent)] shrink-0" />
          <span>Warden Configuration</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Configure standalone Minecraft engine settings, timezone, automated 4 AM update schedules, and API keys.
        </p>
      </Card>

      <form onSubmit={handleSave} className="space-y-4 sm:space-y-6">
        {/* Engine Status Card */}
        <Card header="Orchestrator Engine Status" badge={<WardenIcon name="server" size={16} className="text-[var(--color-accent)]" />}>
          <div className="space-y-3 text-sm font-mono text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)]">
              <span className="text-slate-400">Architecture</span>
              <span className="text-[var(--color-accent)] font-bold">Warden Standalone Native</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)]">
              <span className="text-slate-400">Process Manager</span>
              <span className="text-slate-200">Active (Node Child Process)</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)]">
              <span className="text-slate-400">Supported Modloaders</span>
              <span className="text-slate-200">Paper, Fabric, Purpur, Quilt, Vanilla</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-slate-400">Storage Root</span>
              <span className="text-slate-300">/data/servers/</span>
            </div>
          </div>
        </Card>

        {/* Automated Safety Updates Card */}
        <Card header="Automated Mod Updates Schedule" badge={<WardenIcon name="clock" size={16} className="text-[var(--color-accent)]" />}>
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-200">Enable Automated Mod Updates</div>
                <div className="text-[11px] text-slate-400">Automatically downloads updates from Modrinth with safety backup and rollback.</div>
              </div>
              <input
                type="checkbox"
                checked={autoUpdateEnabled}
                onChange={(e) => setAutoUpdateEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Daily Execution Time (24h format)
              </label>
              <input
                type="time"
                value={autoUpdateTime}
                onChange={(e) => setAutoUpdateTime(e.target.value)}
                disabled={!autoUpdateEnabled}
                className="w-full sm:w-48 bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs sm:text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 font-mono disabled:opacity-50"
              />
            </div>
          </div>
        </Card>

        {/* Timezone Card */}
        <Card header="System Timezone" badge={<WardenIcon name="clock" size={16} className="text-[var(--color-accent)]" />}>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              Timezone
            </label>
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. Europe/Vienna, America/New_York, UTC"
              className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs sm:text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 font-mono"
            />
          </div>
        </Card>

        {/* API Authentication Card */}
        <Card header="Warden API Security" badge={<WardenIcon name="code" size={16} className="text-[var(--color-accent)]" />}>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              Warden API Key (Remote & Integration Clients)
            </label>
            <input
              type="password"
              value={wardenApiKey}
              onChange={(e) => setWardenApiKey(e.target.value)}
              placeholder={settings?.wardenApiKeySet ? '•••••••••••••••• (Key Active)' : 'Set custom API key...'}
              className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs sm:text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-2 font-mono">
              Pass this key in the <code className="text-[var(--color-accent)] bg-black/40 px-1 py-0.5 rounded">X-Warden-API-Key</code> header when calling REST endpoints.
            </p>
          </div>
        </Card>

        {/* System Version & Updates Card */}
        <Card
          header="System Version & Updates"
          badge={
            <span className="bg-emerald-950 text-[var(--color-accent)] border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-minecraft uppercase font-bold tracking-wider">
              Auto-Checking GitHub
            </span>
          }
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="font-semibold text-xs text-slate-200 flex items-center gap-2">
                <span>Warden System Orchestrator</span>
                <span className="bg-[var(--bg-main)] border border-[var(--color-border)] text-slate-300 font-mono text-[10px] px-2 py-0.5 rounded font-bold">
                  {updateInfo?.currentCommit ? `Version: ${updateInfo.currentCommit}` : 'Version: v1'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono leading-relaxed max-w-xl">
                Warden checks GitHub (<code className="text-emerald-400">ExraaG/Warden</code>) on every website load. When updates are published, you can install them with 1 click while preserving all Minecraft server data.
              </p>
              {updateInfo?.latestCommit && (
                <div className="text-[11px] font-mono text-slate-400 pt-1 flex items-center gap-2">
                  <span>Latest GitHub Release:</span>
                  <span className="text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                    {updateInfo.latestCommit}
                  </span>
                  {updateInfo.commitMessage && (
                    <span className="text-slate-500 truncate max-w-md hidden md:inline">
                      — &quot;{updateInfo.commitMessage}&quot;
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                isLoading={checkingUpdate}
                onClick={handleManualCheckUpdate}
                className="text-xs font-minecraft"
              >
                <WardenIcon name="refresh-cw" size={12} className={checkingUpdate ? 'animate-spin' : ''} />
                Check Updates
              </Button>
              {updateInfo?.updateAvailable && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => window.dispatchEvent(new CustomEvent('warden_open_update_modal'))}
                  className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold font-minecraft text-xs"
                >
                  <WardenIcon name="download" size={13} className="text-black" />
                  Install Update
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Android Mobile Client Card */}
        <Card
          header="Android Mobile App"
          badge={
            <span className="bg-emerald-950 text-[var(--color-accent)] border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-minecraft uppercase font-bold tracking-wider">
              Coming Soon
            </span>
          }
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="font-semibold text-xs text-slate-200">
                Native Android Companion for Warden
              </div>
              <p className="text-xs text-slate-400 font-mono leading-relaxed max-w-xl">
                A lightweight Android app built for Warden is in development. It will support real-time push notifications for server crash alerts &amp; mod updates, live console streaming, and quick server power controls from your phone.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-main)] border border-[var(--color-border)] text-xs text-slate-300 font-mono font-medium">
                <WardenIcon name="cpu" size={13} className="text-[var(--color-accent)] shrink-0" />
                In Development
              </span>
            </div>
          </div>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" variant="primary" isLoading={saving} className="px-6">
            <WardenIcon name="check" size={16} className="text-[#0d0e11]" />
            Save Configuration
          </Button>
        </div>
      </form>
    </div>
  );
}
