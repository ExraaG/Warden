'use client';

import React, { useState, useEffect } from 'react';
import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dropdown, DropdownOption } from '../components/ui/Dropdown';
import { WardenServer } from '@warden/shared';
import { WardenIcon, WardenIconName } from '../components/ui/WardenIcon';
import { ToastContainer } from '../components/ui/Toast';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [servers, setServers] = useState<WardenServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('');

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
    loadServers();
    const handleUpdate = () => loadServers();
    window.addEventListener('warden_server_updated', handleUpdate);
    window.addEventListener('warden_server_changed', handleUpdate);
    const interval = setInterval(loadServers, 5000);
    return () => {
      window.removeEventListener('warden_server_updated', handleUpdate);
      window.removeEventListener('warden_server_changed', handleUpdate);
      clearInterval(interval);
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
      sublabel: '1-Click Server Installer',
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
        <title>Warden - Minecraft Server & Mod Ops</title>
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

        {/* Global Floating Toast Notifications */}
        <ToastContainer />
      </body>
    </html>
  );
}
