'use client';

import React, { useState, useEffect } from 'react';
import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dropdown, DropdownOption } from '../components/ui/Dropdown';
import { WardenServer } from '@warden/shared';
import { WardenIcon, WardenIconName } from '../components/ui/WardenIcon';
import { ToastContainer, showToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';

export interface SystemUpdateInfo {
  updateAvailable: boolean;
  version?: string;
  currentCommit: string;
  latestCommit: string;
  commitMessage?: string;
  commitDate?: string;
  author?: string;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [servers, setServers] = useState<WardenServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('');

  // Global GitHub Update State
  const [systemUpdate, setSystemUpdate] = useState<SystemUpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);
  const [installingUpdate, setInstallingUpdate] = useState<boolean>(false);
  const [updateProgressMsg, setUpdateProgressMsg] = useState<string>('');
  const [dismissedCommit, setDismissedCommit] = useState<string>('');

  const checkUpdates = () => {
    fetch('/api/v1/system/update-status?force=true')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          console.log('[Warden] GitHub update check result:', res.data);
          setSystemUpdate(res.data);
        }
      })
      .catch((err) => console.warn('[Warden] Update check failed:', err));
  };

  const [updateProgress, setUpdateProgress] = useState<{
    status: string;
    step: number;
    totalSteps: number;
    stepName: string;
    percent: number;
    details?: string;
    error?: string;
  }>({
    status: 'idle',
    step: 0,
    totalSteps: 4,
    stepName: 'Ready',
    percent: 0,
  });

  const handlePerformSelfUpdate = async () => {
    setInstallingUpdate(true);
    setUpdateProgress({
      status: 'stopping_servers',
      step: 1,
      totalSteps: 4,
      stepName: 'Flushing chunk saves & stopping Minecraft servers...',
      percent: 15,
      details: 'Preserving all world directories, player inventories, and server configurations.',
    });

    try {
      await fetch('/api/v1/system/self-update', { method: 'POST' });
    } catch {}

    // Start progress polling loop
    let isReconnecting = false;
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/v1/system/update-progress').then((r) => r.json());
        if (res.success && res.data) {
          const p = res.data;
          setUpdateProgress(p);

          if (p.status === 'error') {
            clearInterval(pollInterval);
            showToast(`Update failed: ${p.error || 'Unknown error'}`, 'error');
            setInstallingUpdate(false);
            return;
          }

          if (p.status === 'restarting') {
            isReconnecting = true;
          }
        }
      } catch {
        // Server might be compiling or restarting
        if (!isReconnecting) {
          setUpdateProgress((prev) => ({
            ...prev,
            status: 'building',
            step: 3,
            stepName: 'Compiling packages and rebuilding Next.js production bundle...',
            percent: Math.min(85, Math.max(50, prev.percent + 5)),
            details: 'The build is underway in the background. Please wait...',
          }));
        } else {
          setUpdateProgress({
            status: 'restarting',
            step: 4,
            totalSteps: 4,
            stepName: 'Restarting Warden service and reconnecting...',
            percent: 95,
            details: 'Waiting for the web application to come back online...',
          });

          // Check if server came back online
          try {
            const health = await fetch('/api/v1/system/update-status').then((r) => r.json());
            if (health.success) {
              clearInterval(pollInterval);
              setUpdateProgress({
                status: 'completed',
                step: 4,
                totalSteps: 4,
                stepName: 'Update completed successfully! Reloading page...',
                percent: 100,
              });
              showToast('Warden successfully updated!', 'success');
              setTimeout(() => {
                window.location.reload();
              }, 1200);
            }
          } catch {}
        }
      }
    }, 1500);
  };

  const loadServers = () => {
    fetch('/api/v1/servers')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          setServers(data.data);
          const savedId = localStorage.getItem('warden_selected_server_id');
          if (savedId && data.data.some((s: WardenServer) => s.id === savedId)) {
            setSelectedServerId(savedId);
          } else {
            setSelectedServerId(data.data[0].id);
          }
        }
      })
      .catch((err) => console.error('Failed to fetch servers for top-left dropdown:', err));
  };

  useEffect(() => {
    // Check for updates on every page / website load
    checkUpdates();
    loadServers();

    const handleUpdate = () => loadServers();
    const handleTriggerUpdateModal = () => setShowUpdateModal(true);

    window.addEventListener('warden_server_updated', handleUpdate);
    window.addEventListener('warden_server_changed', handleUpdate);
    window.addEventListener('warden_open_update_modal', handleTriggerUpdateModal);

    // Periodic check every 5 minutes in background
    const updateInterval = setInterval(checkUpdates, 5 * 60 * 1000);
    const serverInterval = setInterval(loadServers, 5000);

    return () => {
      window.removeEventListener('warden_server_updated', handleUpdate);
      window.removeEventListener('warden_server_changed', handleUpdate);
      window.removeEventListener('warden_open_update_modal', handleTriggerUpdateModal);
      clearInterval(updateInterval);
      clearInterval(serverInterval);
    };
  }, []);

  const handleSelectServer = (option: DropdownOption) => {
    if (option.id === '__create_new__') {
      window.dispatchEvent(new CustomEvent('warden_open_create_server'));
      return;
    }
    setSelectedServerId(option.id);
    localStorage.setItem('warden_selected_server_id', option.id);
    window.dispatchEvent(new CustomEvent('warden_server_changed', { detail: option.id }));
  };

  const dropdownOptions: DropdownOption[] = [
    ...servers.map((s) => {
      const loaderName = (s.detection?.loader && s.detection.loader !== 'unknown' ? s.detection.loader : 'fabric').toUpperCase();
      const versionNum = s.detection?.mcVersion || '1.21.1';
      return {
        id: s.id,
        label: s.name,
        sublabel: `${loaderName} • ${versionNum}`,
        status: s.status,
      };
    }),
    {
      id: '__create_new__',
      label: '+ Create New Server',
      sublabel: 'Install Vanilla, Fabric, or Paper',
    },
  ];

  const navItems: { href: string; label: string; icon: WardenIconName }[] = [
    { href: '/', label: 'Dashboard', icon: 'box' },
    { href: '/jobs', label: 'Audit Logs', icon: 'clock' },
    { href: '/settings', label: 'Settings', icon: 'settings' },
  ];

  return (
    <html lang="en" className="dark" data-theme="emerald" suppressHydrationWarning>
      <head>
        <title>Warden - Minecraft Server &amp; Mod Ops</title>
        <meta name="description" content="Self-hosted Minecraft server and mod management tool" />
        <link rel="icon" href="/logo.svg" type="image/svg+xml" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const t = localStorage.getItem('warden-theme') || 'emerald';
                document.documentElement.setAttribute('data-theme', t);
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning className="bg-[var(--bg-main)] text-slate-100 min-h-screen flex flex-col font-sans transition-colors duration-200">
        {/* Global Update Notification Banner */}
        {systemUpdate?.updateAvailable && dismissedCommit !== systemUpdate.latestCommit && (
          <div className="bg-gradient-to-r from-emerald-950/95 via-slate-900/95 to-emerald-950/95 border-b border-emerald-500/40 px-3 sm:px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 z-50 shadow-lg shadow-emerald-950/30">
            <div className="flex items-center gap-2.5 min-w-0 w-full sm:w-auto">
              <WardenIcon name="download" size={15} className="text-emerald-400 shrink-0" />
              <span className="font-minecraft text-xs font-bold text-emerald-300 tracking-wide shrink-0">
                NEW UPDATE AVAILABLE
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="bg-slate-800 text-slate-400 border border-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono">
                  {systemUpdate.currentCommit}
                </span>
                <span className="text-slate-500 text-xs">→</span>
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-600/70 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
                  {systemUpdate.latestCommit}
                </span>
              </div>
              <span className="text-xs text-slate-300 font-mono truncate hidden md:inline">
                {systemUpdate.commitMessage || 'Latest release ready to install'}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDismissedCommit(systemUpdate.latestCommit)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                Later
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowUpdateModal(true)}
                className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold font-minecraft text-xs shadow-md shadow-emerald-950/40"
              >
                <WardenIcon name="download" size={13} className="text-black" />
                Accept &amp; Update
              </Button>
            </div>
          </div>
        )}

        {/* Seamless Header (Same background color as page) */}
        <header className="bg-[var(--bg-main)] px-3 sm:px-6 py-2.5 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 sticky top-0 z-40 transition-colors border-b border-white/[0.04] sm:border-b-0">
          <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
            {/* Brand Logo */}
            <Link href="/" className="flex items-center gap-1.5 group shrink-0">
              <div className="h-8 w-11 sm:h-9 sm:w-12 warden-logo-mask shrink-0" />
              <span className="font-minecraft font-bold text-lg sm:text-2xl tracking-widest text-slate-100 group-hover:text-[var(--color-accent)] transition-colors leading-none">
                WARDEN
              </span>
            </Link>

            {/* Mobile Server Switcher */}
            {dropdownOptions.length > 0 && (
              <div className="sm:hidden flex-1 max-w-[200px] ml-auto">
                <Dropdown
                  options={dropdownOptions}
                  selectedId={selectedServerId}
                  onSelect={handleSelectServer}
                  title="Select Server"
                  size="sm"
                  className="w-full"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4 w-full sm:w-auto">
            {/* Desktop Server Switcher */}
            {dropdownOptions.length > 0 && (
              <div className="hidden sm:block">
                <Dropdown
                  options={dropdownOptions}
                  selectedId={selectedServerId}
                  onSelect={handleSelectServer}
                  title="Select Minecraft Server"
                  className="w-52 md:w-64 shrink min-w-[140px]"
                />
              </div>
            )}

            {/* Nav Links */}
            <nav className="flex items-center gap-1 sm:gap-1.5 text-sm font-medium w-full sm:w-auto justify-between sm:justify-start flex-nowrap shrink-0">
              {systemUpdate?.updateAvailable && (
                <button
                  onClick={() => setShowUpdateModal(true)}
                  className="bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500 hover:text-black font-minecraft text-[10px] sm:text-xs px-2 sm:px-2.5 py-1.5 rounded-md flex items-center gap-1.5 transition-all shrink-0"
                  title="New update available on GitHub"
                >
                  <WardenIcon name="download" size={11} className="text-emerald-400 shrink-0" />
                  <span>UPDATE</span>
                </button>
              )}
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex-1 sm:flex-initial text-center justify-center px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-md flex items-center gap-1.5 sm:gap-2 transition-all font-minecraft text-[10px] sm:text-xs shrink-0 whitespace-nowrap ${
                      isActive
                        ? 'bg-[var(--accent-dim)] text-[var(--color-accent)] font-bold border border-[var(--accent-border)]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-[var(--accent-dim)]/20 border border-transparent'
                    }`}
                  >
                    <WardenIcon name={item.icon} size={13} className={isActive ? 'text-[var(--color-accent)]' : 'text-slate-400'} />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pt-1 sm:pt-2 pb-6">{children}</main>

        {/* Global Self-Update Modal */}
        <Modal
          isOpen={showUpdateModal}
          onClose={() => !installingUpdate && setShowUpdateModal(false)}
          title="Install Warden Update"
          maxWidth="xl"
        >
          <div className="flex flex-col gap-4">
            <div className="bg-[var(--bg-card)] border border-[var(--color-border)] rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-slate-400">Target Commit / Release</span>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40 font-bold">
                  {systemUpdate?.latestCommit || 'latest'}
                </span>
              </div>
              {systemUpdate?.commitMessage && (
                <div className="text-sm font-semibold text-slate-200 font-mono">
                  &quot;{systemUpdate.commitMessage}&quot;
                </div>
              )}
              {systemUpdate?.author && (
                <div className="text-xs font-mono text-slate-400">
                  Author: <span className="text-slate-300">{systemUpdate.author}</span>
                </div>
              )}
            </div>

            <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                <WardenIcon name="triangle-alert" size={16} className="text-amber-400" />
                Important Update Notice &amp; Disclaimer
              </div>
              <ul className="text-xs text-amber-200/80 font-mono space-y-1.5 pl-4 list-disc leading-relaxed">
                <li>
                  <strong>All Server Data is Preserved:</strong> All your Minecraft worlds, configs, player inventories, mods, and plugins in <code className="text-amber-300">/data</code> are 100% safe and will NOT be modified.
                </li>
                <li>
                  <strong>Servers Gracefully Stopped:</strong> Any currently active Minecraft servers will be safely stopped before updating to flush world chunk saves and avoid any corrupted save states.
                </li>
                <li>
                  <strong>Rebuild Sequence:</strong> Warden will pull the latest release from GitHub, build the application, and restart the service automatically.
                </li>
              </ul>
            </div>

            {installingUpdate && (
              <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 flex flex-col gap-3 shadow-inner">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-400">
                    <WardenIcon name="refresh-cw" size={14} className="animate-spin text-emerald-400 shrink-0" />
                    <span>
                      {updateProgress.step > 0 && `Step ${updateProgress.step} of ${updateProgress.totalSteps}: `}
                      {updateProgress.stepName || 'Updating Warden...'}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950 border border-emerald-800/60 px-2 py-0.5 rounded">
                    {updateProgress.percent}%
                  </span>
                </div>

                {/* Animated Progress Bar */}
                <div className="w-full bg-slate-950 rounded-full h-3.5 overflow-hidden border border-slate-800 p-0.5">
                  <div
                    className="bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 h-full rounded-full transition-all duration-500 shadow-sm shadow-emerald-500/50"
                    style={{ width: `${Math.max(5, updateProgress.percent)}%` }}
                  />
                </div>

                {updateProgress.details && (
                  <p className="text-[11px] font-mono text-slate-400 leading-relaxed">
                    {updateProgress.details}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[var(--color-border)]">
              <Button
                variant="outline"
                size="sm"
                disabled={installingUpdate}
                onClick={() => setShowUpdateModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={installingUpdate}
                onClick={handlePerformSelfUpdate}
                className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold font-minecraft text-xs"
              >
                <WardenIcon name="download" size={14} className="text-black" />
                Confirm &amp; Install Update
              </Button>
            </div>
          </div>
        </Modal>

        {/* Global Floating Toast Notifications */}
        <ToastContainer />
      </body>
    </html>
  );
}
