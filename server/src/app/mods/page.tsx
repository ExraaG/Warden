'use client';

import React, { useState, useEffect } from 'react';
import { WardenServer, InstalledMod, ModrinthSearchItem, ModrinthVersion } from '@warden/shared';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { WardenIcon } from '../../components/ui/WardenIcon';
import { showToast } from '../../components/ui/Toast';

export default function ModsPage() {
  const [serverId, setServerId] = useState<string>('');
  const [server, setServer] = useState<WardenServer | null>(null);
  const [installedMods, setInstalledMods] = useState<InstalledMod[]>([]);
  const [loadingMods, setLoadingMods] = useState<boolean>(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searching, setSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<ModrinthSearchItem[]>([]);

  // Install modal state
  const [selectedMod, setSelectedMod] = useState<ModrinthSearchItem | null>(null);
  const [versions, setVersions] = useState<ModrinthVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [installing, setInstalling] = useState<boolean>(false);

  const loadServerAndMods = (id: string) => {
    if (!id) return;
    setLoadingMods(true);

    fetch(`/api/v1/servers/${id}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) setServer(res.data);
      });

    fetch(`/api/v1/servers/${id}/mods`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          setInstalledMods(res.data);
        }
      })
      .catch((err) => console.error('Error fetching mods:', err))
      .finally(() => setLoadingMods(false));
  };

  useEffect(() => {
    const savedId = localStorage.getItem('warden_selected_server_id') || '';
    if (savedId) {
      setServerId(savedId);
      loadServerAndMods(savedId);
    }

    const handleServerChange = (e: any) => {
      const newId = e.detail;
      setServerId(newId);
      loadServerAndMods(newId);
    };

    window.addEventListener('warden_server_changed', handleServerChange);
    return () => window.removeEventListener('warden_server_changed', handleServerChange);
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || !serverId) return;

    setSearching(true);
    try {
      const res = await fetch(`/api/v1/servers/${serverId}/mods/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setSearchResults(data.data);
      }
    } catch (err) {
      console.error('Error searching mods:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleOpenInstall = async (mod: ModrinthSearchItem) => {
    setSelectedMod(mod);
    setVersions([]);

    try {
      const res = await fetch(`/api/v1/servers/${serverId}/mods/versions?projectId=${mod.id}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setVersions(data.data);
        if (data.data.length > 0) setSelectedVersionId(data.data[0].id);
      }
    } catch (err) {
      console.error('Error fetching versions:', err);
    }
  };

  const handleConfirmInstall = async () => {
    if (!serverId || !selectedMod || !selectedVersionId) return;

    setInstalling(true);
    try {
      const res = await fetch(`/api/v1/servers/${serverId}/mods/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedMod.id,
          versionId: selectedVersionId,
          includeDependencies: true,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSelectedMod(null);
        loadServerAndMods(serverId);
      }
    } catch (err) {
      console.error('Error installing mod:', err);
    } finally {
      setInstalling(false);
    }
  };

  const handleDeleteMod = async (filename: string) => {
    if (!serverId) return;

    try {
      const res = await fetch(`/api/v1/servers/${serverId}/mods/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      }).then((r) => r.json());
      if (res.success) {
        showToast(`Removed mod ${filename}`, 'info');
        loadServerAndMods(serverId);
      } else {
        showToast(`Failed to remove mod: ${res.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Error deleting mod: ${err.message}`, 'error');
    }
  };

  const formatDownloads = (downloads: number) => {
    if (downloads >= 1_000_000) return `${(downloads / 1_000_000).toFixed(2)}M`;
    if (downloads >= 1_000) return `${(downloads / 1_000).toFixed(1)}K`;
    return downloads.toString();
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Search Input & Controls Bar */}
      <form onSubmit={handleSearch} className="bg-[var(--bg-surface)] border border-[var(--color-border)] rounded-xl p-2.5 sm:p-3 flex items-center gap-2 sm:gap-3 shadow-sm">
        <WardenIcon name="search" size={18} className="text-slate-400 ml-1.5 shrink-0" />
        <input
          type="text"
          placeholder="Search Modrinth mods & plugins..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-slate-100 placeholder:text-slate-500 font-sans text-xs sm:text-sm focus:outline-none min-w-0"
        />
        <Button variant="primary" size="sm" type="submit" isLoading={searching} className="shrink-0">
          Search
        </Button>
      </form>

      {/* Filter Info Bar */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1 font-sans flex-wrap gap-2">
        <div className="text-[11px] sm:text-xs">
          Active Loader: <span className="text-[var(--color-accent)] font-semibold uppercase">{server?.detection?.loader || 'FABRIC'}</span> • Version: <span className="text-[var(--color-accent)] font-semibold">{server?.detection?.mcVersion || '1.21.1'}</span>
        </div>
        {searchResults.length > 0 && (
          <div className="text-[11px] sm:text-xs text-slate-400">
            Showing <strong className="text-slate-200">{searchResults.length}</strong> results
          </div>
        )}
      </div>

      {/* Search Results List */}
      {searchResults.length > 0 && (
        <div className="space-y-2.5 sm:space-y-3">
          {searchResults.map((item) => (
            <div
              key={item.id}
              className="bg-[var(--bg-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row items-start justify-between gap-3 transition-all shadow-sm"
            >
              {/* Left: Mod Icon & Title Info */}
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {item.iconUrl ? (
                  <img
                    src={item.iconUrl}
                    alt={item.title}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg object-contain bg-[var(--bg-main)] border border-[var(--color-border)] p-1 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-[var(--accent-dim)] border border-[var(--accent-border)] flex items-center justify-center font-bold text-[var(--color-accent)] text-lg shrink-0">
                    {item.title.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Content */}
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-100 text-xs sm:text-sm hover:text-[var(--color-accent)] cursor-pointer transition-colors truncate">
                      {item.title}
                    </h3>
                    <span className="text-[11px] text-slate-400 font-medium">by {item.author}</span>
                  </div>

                  <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>

                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {item.categories.slice(0, 3).map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1 bg-[var(--bg-card)] text-slate-300 text-[10px] px-2 py-0.5 rounded-full border border-[var(--color-border)] capitalize"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--color-border)]">
                <span className="text-[11px] text-slate-400 font-mono">
                  {formatDownloads(item.downloads)} DL
                </span>

                <Button variant="primary" size="sm" onClick={() => handleOpenInstall(item)}>
                  <WardenIcon name="download" size={14} className="text-[#0d0e11]" />
                  <span>Install</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Installed Mods Section */}
      <Card className="p-3 sm:p-5 space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-minecraft text-xs sm:text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <WardenIcon name="box" size={16} className="text-[var(--color-accent)]" />
            <span>Installed Files ({installedMods.length})</span>
          </h2>
        </div>

        {loadingMods ? (
          <div className="py-12 text-center text-slate-500 font-mono text-xs">LOADING INSTALLED MODS...</div>
        ) : installedMods.length === 0 ? (
          <div className="py-12 text-center text-slate-500 font-mono text-xs">
            No mod files found in server mods/ directory.
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]/50">
            {installedMods.map((m) => (
              <div key={m.filename} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded bg-[var(--accent-dim)] border border-[var(--accent-border)] flex items-center justify-center font-bold text-[var(--color-accent)] text-xs shrink-0 font-mono">
                    {m.filename.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-100 font-mono text-xs truncate">{m.filename}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{formatBytes(m.size || 0)}</div>
                  </div>
                </div>

                <Button variant="danger" size="sm" onClick={() => handleDeleteMod(m.filename)} className="p-1.5 shrink-0">
                  <WardenIcon name="trash" size={13} className="text-white" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Mod Install & Dependency Modal */}
      <Modal
        isOpen={Boolean(selectedMod)}
        onClose={() => setSelectedMod(null)}
        title={`Install ${selectedMod?.title}`}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setSelectedMod(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleConfirmInstall} isLoading={installing}>
              Confirm &amp; Install
            </Button>
          </>
        }
      >
        {selectedMod && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {selectedMod.iconUrl ? (
                <img
                  src={selectedMod.iconUrl}
                  alt={selectedMod.title}
                  className="w-12 h-12 rounded-xl object-contain bg-[var(--bg-main)] border border-[var(--color-border)] p-1 shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-[var(--accent-dim)] border border-[var(--accent-border)] flex items-center justify-center font-bold text-[var(--color-accent)] text-lg shrink-0">
                  {selectedMod.title.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <h4 className="font-bold text-slate-100 text-sm sm:text-base truncate">{selectedMod.title}</h4>
                <div className="text-xs text-[var(--color-accent)]">by {selectedMod.author}</div>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{selectedMod.description}</p>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Select Compatible Version
              </label>
              <select
                value={selectedVersionId}
                onChange={(e) => setSelectedVersionId(e.target.value)}
                className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs sm:text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.versionNumber})
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-[var(--bg-main)] p-3 rounded-md border border-[var(--color-border)] text-xs space-y-1">
              <div className="text-[var(--color-accent)] font-bold flex items-center gap-1.5 font-minecraft">
                <WardenIcon name="check" size={14} />
                <span>Automatic Dependency Resolution</span>
              </div>
              <div className="text-slate-400 text-[11px]">
                Warden will resolve and download all required dependencies matching loader <strong className="text-slate-200">{server?.detection?.loader}</strong> and MC <strong className="text-slate-200">{server?.detection?.mcVersion}</strong> before deploying.
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
