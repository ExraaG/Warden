'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { WardenSettings } from '@warden/shared';
import { WardenIcon } from '../../components/ui/WardenIcon';
import { showToast } from '../../components/ui/Toast';

export default function SettingsPage() {
  const [settings, setSettings] = useState<WardenSettings | null>(null);
  const [craftyUrl, setCraftyUrl] = useState<string>('');
  const [craftyApiKey, setCraftyApiKey] = useState<string>('');
  const [wardenApiKey, setWardenApiKey] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('Europe/Vienna');
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/v1/settings')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setSettings(res.data);
          setCraftyUrl(res.data.craftyUrl || '');
          setTimezone(res.data.timezone || 'Europe/Vienna');
        }
      })
      .catch((err) => console.error('Error loading settings:', err));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/v1/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          craftyUrl,
          craftyApiKey: craftyApiKey || undefined,
          wardenApiKey: wardenApiKey || undefined,
          timezone,
        }),
      }).then((r) => r.json());

      if (res.success) {
        setCraftyApiKey('');
        setWardenApiKey('');
        setSettings(res.data);
        window.dispatchEvent(new CustomEvent('warden_server_updated'));
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
          Configure Crafty Controller endpoints, API keys, timezone, and OpenAPI schema sync
        </p>
      </Card>

      <form onSubmit={handleSave} className="space-y-4 sm:space-y-6">
        {/* Crafty Connection Card */}
        <Card header="Crafty Controller API Connection" badge={<WardenIcon name="server" size={16} className="text-[var(--color-accent)]" />}>
          <div className="space-y-4 text-sm">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Crafty Base URL
              </label>
              <input
                type="text"
                value={craftyUrl}
                onChange={(e) => setCraftyUrl(e.target.value)}
                placeholder="https://your-crafty-host:8443 or https://host.docker.internal:8443"
                className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs sm:text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Crafty Bearer API Key
              </label>
              <input
                type="password"
                value={craftyApiKey}
                onChange={(e) => setCraftyApiKey(e.target.value)}
                placeholder={settings?.craftyApiKeySet ? '•••••••••••••••• (Key Configured)' : 'Enter long-lived Crafty API Key...'}
                className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs sm:text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 font-mono"
              />
              <p className="text-[11px] sm:text-xs text-slate-500 mt-1 font-mono leading-relaxed">
                In Crafty: click your <strong className="text-slate-300">Profile (top-right)</strong> &rarr; <strong className="text-slate-300">Account Settings</strong> &rarr; <strong className="text-slate-300">API Keys</strong> &rarr; Create Key with <strong className="text-[var(--color-accent)]">Full Access</strong> &rarr; <strong className="text-slate-300">Get Token</strong>.
              </p>
            </div>
          </div>
        </Card>

        {/* Warden API Authentication Card */}
        <Card header="Warden API Authentication" badge={<WardenIcon name="binary" size={16} className="text-[var(--color-accent)]" />}>
          <div className="space-y-4 text-sm">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Warden API Key (Mobile &amp; Remote Clients)
              </label>
              <input
                type="password"
                value={wardenApiKey}
                onChange={(e) => setWardenApiKey(e.target.value)}
                placeholder={settings?.wardenApiKeySet ? '•••••••••••••••• (Key Active)' : 'Enter new Warden API key...'}
                className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs sm:text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 font-mono"
              />
              <p className="text-[11px] sm:text-xs text-slate-500 mt-1 font-mono">
                Pass this key in the <code className="text-[var(--color-accent)]">X-Warden-API-Key</code> header when connecting thin client apps.
              </p>
            </div>
          </div>
        </Card>

        {/* Timezone Card */}
        <Card header="Automated 4 AM Job Timezone" badge={<WardenIcon name="clock" size={16} className="text-[var(--color-accent)]" />}>
          <div className="space-y-4 text-sm">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                System Timezone
              </label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="e.g. Europe/Vienna, UTC, America/New_York"
                className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs sm:text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 font-mono"
              />
            </div>
          </div>
        </Card>

        {/* OpenAPI Schema Status */}
        <Card header="Crafty OpenAPI Schema Auto-Validation" badge={<WardenIcon name="check" size={16} className="text-[var(--color-accent)]" />}>
          <div className="text-xs space-y-2 font-mono">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-slate-400">SCHEMA VALIDATED AT STARTUP:</span>
              <span className={settings?.schemaValidated ? 'text-[var(--color-accent)] font-bold' : 'text-amber-400 font-bold'}>
                {settings?.schemaValidated ? 'VALIDATED & CACHED' : 'USING DEFAULT SCHEMA'}
              </span>
            </div>
            {settings?.schemaFieldNames && (
              <div className="bg-[var(--bg-main)] p-3 rounded-md border border-[var(--color-border)] text-slate-400 space-y-1 text-[11px]">
                <div className="break-all">FILE LIST PATH FIELD: <strong className="text-slate-200">{settings.schemaFieldNames.fileListPathField}</strong></div>
                <div className="break-all">UPLOAD TYPE FIELD: <strong className="text-slate-200">{settings.schemaFieldNames.uploadTypeField}</strong></div>
                <div className="break-all">UPLOAD SERVER ID FIELD: <strong className="text-slate-200">{settings.schemaFieldNames.uploadServerIdField}</strong></div>
                <div className="break-all">UPLOAD FILE FIELD: <strong className="text-slate-200">{settings.schemaFieldNames.uploadFileField}</strong></div>
              </div>
            )}
          </div>
        </Card>

        <div className="flex flex-col sm:flex-row justify-end">
          <Button variant="primary" size="lg" type="submit" isLoading={saving} className="w-full sm:w-auto">
            Save Configuration
          </Button>
        </div>
      </form>
    </div>
  );
}

